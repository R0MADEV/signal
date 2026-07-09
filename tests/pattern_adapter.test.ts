import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, type ChecksDeps } from "../src/checks.js";
import { summarizeRun } from "../src/summary.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);
let root: string;
let deps: ChecksDeps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-pattern-"));
  const storage = new Storage(root);
  const runner = new Runner(storage);
  const config: Config = { root, checks: {} };
  deps = { config, storage, runner };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("pattern field", () => {
  it("captures lines matching pattern with named groups", async () => {
    deps.config.checks.tool = {
      cmd: `${NODE} -e "console.log('ERROR [src/foo.ts:10:5] something broke')"`,
      timeout_ms: 5000,
      adapter: "generic",
      pattern: "ERROR \\[(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+)\\] (?<message>.+)"
    };
    const r = startCheck(deps, { name: "tool" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(1);
    expect(s.top_groups[0].message).toBe("something broke");
    expect(s.top_groups[0].files).toContain("src/foo.ts");
    expect(s.top_groups[0].occurrences[0]).toMatchObject({ line: 10, column: 5 });
  });

  it("captures lines matching pattern without named groups (message only)", async () => {
    deps.config.checks.tool = {
      cmd: `${NODE} -e "console.log('FAIL: something broke'); console.log('ok line')"`,
      timeout_ms: 5000,
      adapter: "generic",
      pattern: "^FAIL: (.+)"
    };
    const r = startCheck(deps, { name: "tool" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(1);
    expect(s.top_groups[0].message).toContain("something broke");
  });

  it("pattern overrides the adapter parser", async () => {
    // This line matches generic file:line format but not the pattern — should NOT be captured
    deps.config.checks.tool = {
      cmd: `${NODE} -e "console.log('src/a.ts:1:1: generic error'); console.log('FAIL: pattern error')"`,
      timeout_ms: 5000,
      adapter: "generic",
      pattern: "^FAIL: (?<message>.+)"
    };
    const r = startCheck(deps, { name: "tool" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(1);
    expect(s.top_groups[0].message).toBe("pattern error");
  });

  it("returns [] when no lines match pattern", async () => {
    deps.config.checks.tool = {
      cmd: `${NODE} -e "console.log('nothing matches here')"`,
      timeout_ms: 5000,
      adapter: "generic",
      pattern: "^FAIL: .+"
    };
    const r = startCheck(deps, { name: "tool" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(0);
  });
});
