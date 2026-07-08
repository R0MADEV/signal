import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, type ChecksDeps } from "../src/checks.js";
import { summarizeRun } from "../src/summary.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;
let deps: ChecksDeps;

function makeConfig(root: string): Config {
  return {
    root,
    checks: {
      clean: {
        cmd: `${NODE} -e "console.log('all good')"`,
        timeout_ms: 5_000,
        adapter: "generic"
      },
      noisy: {
        cmd: `${NODE} -e "console.log('src/a.ts:10:5: Cannot find name foo'); console.log('src/b.ts:20:3: Cannot find name bar')"`,
        timeout_ms: 5_000,
        adapter: "generic"
      },
      bursty: {
        cmd: `${NODE} -e "for (let i=0;i<8;i++) console.log('src/x.ts:'+i+':1: Variable x must be at least '+i)"`,
        timeout_ms: 5_000,
        adapter: "generic"
      }
    }
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-summary-"));
  storage = new Storage(root);
  runner = new Runner(storage);
  deps = { config: makeConfig(root), storage, runner };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("summarizeRun", () => {
  it("rejects unknown run_id", () => {
    expect(() => summarizeRun(deps, { run_id: "nope" })).toThrow();
  });

  it("reports status=running for an in-flight run", () => {
    const r = startCheck(deps, { name: "noisy" });
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.status).toBe("running");
    return r.done;
  });

  it("returns zero errors for a clean completed run", async () => {
    const r = startCheck(deps, { name: "clean" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.status).toBe("completed");
    expect(s.error_count).toBe(0);
    expect(s.group_count).toBe(0);
    expect(s.top_groups).toEqual([]);
  });

  it("parses and groups errors from a noisy run", async () => {
    const r = startCheck(deps, { name: "noisy" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(2);
    expect(s.group_count).toBe(2);
    expect(s.top_groups).toHaveLength(2);
    expect(s.top_groups[0].files.length).toBeGreaterThan(0);
  });

  it("groups numerically-varying errors into one group via fingerprint", async () => {
    const r = startCheck(deps, { name: "bursty" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(8);
    expect(s.group_count).toBe(1);
    expect(s.top_groups[0].count).toBe(8);
  });

  it("respects max_groups truncation", async () => {
    const r = startCheck(deps, { name: "noisy" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id, max_groups: 1 });
    expect(s.top_groups).toHaveLength(1);
    expect(s.group_count).toBe(2);
  });

  it("respects max_occurrences truncation per group", async () => {
    const r = startCheck(deps, { name: "bursty" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id, max_occurrences: 3 });
    expect(s.top_groups[0].count).toBe(8);
    expect(s.top_groups[0].occurrences).toHaveLength(3);
  });

  it("rejects non-positive max_groups", () => {
    const meta = storage.createRun({ check: "x", cmd: "x", cwd: root, timeout_ms: 1000 }).meta;
    storage.updateMeta(meta.run_id, { status: "completed", exit_code: 0 });
    expect(() => summarizeRun(deps, { run_id: meta.run_id, max_groups: 0 })).toThrow();
    expect(() => summarizeRun(deps, { run_id: meta.run_id, max_groups: -1 })).toThrow();
  });

  it("falls back gracefully when adapter parsing throws", async () => {
    deps.config.checks.brokenJson = {
      cmd: `${NODE} -e "console.log('not json at all')"`,
      timeout_ms: 5_000,
      adapter: "phpstan"
    };
    const r = startCheck(deps, { name: "brokenJson" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.parse_error).toMatch(/JSON/i);
    expect(s.error_count).toBe(0);
    expect(s.top_groups).toEqual([]);
  });

  it("filters out warnings when severity=error", async () => {
    deps.config.checks.mixed = {
      cmd: `${NODE} -e "process.stdout.write('src/a.ts(1,1): error TS1: boom\\nsrc/b.ts(2,2): warning TS2: heads up\\n')"`,
      timeout_ms: 5_000,
      adapter: "generic"
    };
    const r = startCheck(deps, { name: "mixed" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id, severity: "error" });
    expect(s.top_groups.every(g => g.type === "error")).toBe(true);
    expect(s.top_groups.some(g => g.type === "warning")).toBe(false);
  });

  it("includes warnings when no severity filter is set", async () => {
    deps.config.checks.mixed = {
      cmd: `${NODE} -e "process.stdout.write('src/a.ts(1,1): error TS1: boom\\nsrc/b.ts(2,2): warning TS2: heads up\\n')"`,
      timeout_ms: 5_000,
      adapter: "generic"
    };
    const r = startCheck(deps, { name: "mixed" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.top_groups.some(g => g.type === "warning")).toBe(true);
  });

  it("sort_by=last puts the error that appears last in the log first", async () => {
    deps.config.checks.ordered = {
      cmd: `${NODE} -e "
        console.log('src/a.ts:1:1: error one');
        console.log('src/a.ts:2:1: error one');
        console.log('src/a.ts:3:1: error one');
        console.log('src/b.ts:10:1: error two');
      "`,
      timeout_ms: 5_000,
      adapter: "generic"
    };
    const r = startCheck(deps, { name: "ordered" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id, sort_by: "last" });
    // "error two" appears last in the log → should be first when sorted by last position
    expect(s.top_groups[0].message).toContain("error two");
  });

  it("default sort (count) puts most frequent error first", async () => {
    deps.config.checks.ordered = {
      cmd: `${NODE} -e "
        console.log('src/a.ts:1:1: error one');
        console.log('src/a.ts:2:1: error one');
        console.log('src/a.ts:3:1: error one');
        console.log('src/b.ts:10:1: error two');
      "`,
      timeout_ms: 5_000,
      adapter: "generic"
    };
    const r = startCheck(deps, { name: "ordered" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.top_groups[0].message).toContain("error one");
  });

  it("includes a human-readable one-line summary", async () => {
    const r = startCheck(deps, { name: "noisy" });
    await r.done;
    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(typeof s.summary).toBe("string");
    expect(s.summary.length).toBeGreaterThan(0);
    expect(s.summary).toMatch(/noisy/);
  });
});
