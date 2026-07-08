import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, type ChecksDeps } from "../src/checks.js";
import { rerunFailed } from "../src/rerun.js";
import { computeRunGroups } from "../src/summary.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;
let deps: ChecksDeps;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "signal-rerun-")));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function withConfig(checks: Config["checks"]): ChecksDeps {
  return { config: { root, checks }, storage, runner };
}

describe("rerunFailed", () => {
  it("rejects unknown run_id", async () => {
    deps = withConfig({});
    await expect(
      rerunFailed(deps, { run_id: "nope_run", fingerprint: "deadbeefcafe" })
    ).rejects.toThrow(/Unknown run_id/);
  });

  it("rejects unknown fingerprint within a known run", async () => {
    deps = withConfig({
      x: {
        cmd: `${NODE} -e "console.log('src/a.ts:1:1: error a'); process.exit(1);"`,
        timeout_ms: 5_000,
        adapter: "generic"
      }
    });
    const r = startCheck(deps, { name: "x" });
    await r.done;
    await expect(
      rerunFailed(deps, { run_id: r.run_id, fingerprint: "deadbeefcafe" })
    ).rejects.toThrow(/no group with fingerprint/i);
  });

  it("rejects when the adapter does not support rerun (generic)", async () => {
    deps = withConfig({
      x: {
        cmd: `${NODE} -e "console.log('src/a.ts:1:1: error a'); process.exit(1);"`,
        timeout_ms: 5_000,
        adapter: "generic"
      }
    });
    const r = startCheck(deps, { name: "x" });
    await r.done;
    const { groups } = computeRunGroups(deps, r.run_id);
    expect(groups.length).toBeGreaterThan(0);
    const fp = groups[0].fingerprint;

    await expect(rerunFailed(deps, { run_id: r.run_id, fingerprint: fp })).rejects.toThrow(
      /does not support rerun/i
    );
  });

  it("re-executes a drill command using the adapter's buildRerunCmd and returns its log", async () => {
    deps = withConfig({
      x: {
        cmd: `${NODE} -e "console.log('src/foo.ts'); console.log('  10:5  error  Cannot find name fooz  no-undef'); process.exit(1);"`,
        timeout_ms: 5_000,
        adapter: "eslint"
      }
    });
    const r = startCheck(deps, { name: "x" });
    await r.done;
    const { groups } = computeRunGroups(deps, r.run_id);
    expect(groups.length).toBeGreaterThan(0);
    const fp = groups[0].fingerprint;
    const result = await rerunFailed(deps, { run_id: r.run_id, fingerprint: fp });
    expect(result.source_run_id).toBe(r.run_id);
    expect(result.rerun_run_id).not.toBe(r.run_id);
    expect(result.rerun_cmd).toContain("src/foo.ts");
    expect(typeof result.duration_ms === "number").toBe(true);
  });
});
