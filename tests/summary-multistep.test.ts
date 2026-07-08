import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
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

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "signal-summulti-")));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function configWith(checks: Config["checks"]): Config {
  return { root, checks };
}

describe("summarizeRun for multi-step checks", () => {
  it("returns kind=multi-step and lists steps when all pass", async () => {
    const deps: ChecksDeps = {
      config: configWith({
        pipeline: {
          steps: [
            { name: "a", cmd: `${NODE} -e "console.log('a')"`, timeout_ms: 5_000, adapter: "generic" },
            { name: "b", cmd: `${NODE} -e "console.log('b')"`, timeout_ms: 5_000, adapter: "generic" }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const r = startCheck(deps, { name: "pipeline" });
    await r.done;

    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.kind).toBe("multi-step");
    expect(s.status).toBe("completed");
    expect(s.step_count).toBe(2);
    expect(s.failed_step).toBeNull();
    expect(s.steps).toHaveLength(2);
    expect(s.steps?.[0].status).toBe("completed");
    expect(s.steps?.[1].status).toBe("completed");
    expect(s.summary).toMatch(/pipeline.*passed/i);
  });

  it("reports failed_step and 'failed at step N/M' line when fail_fast aborts", async () => {
    const deps: ChecksDeps = {
      config: configWith({
        pipeline: {
          steps: [
            { name: "ok", cmd: `${NODE} -e "console.log('ok')"`, timeout_ms: 5_000, adapter: "generic" },
            { name: "boom", cmd: `${NODE} -e "process.exit(2)"`, timeout_ms: 5_000, adapter: "generic" },
            { name: "never", cmd: `${NODE} -e "console.log('never')"`, timeout_ms: 5_000, adapter: "generic" }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const r = startCheck(deps, { name: "pipeline" });
    await r.done;

    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.status).toBe("failed");
    expect(s.failed_step).toBe("boom");
    expect(s.summary).toMatch(/failed at step 2\/3/);
    expect(s.summary).toMatch(/boom/);
    expect(s.steps?.[2].status).toBe("skipped");
  });

  it("aggregates parsed errors from any step that has an adapter and produces matches", async () => {
    const deps: ChecksDeps = {
      config: configWith({
        pipeline: {
          steps: [
            {
              name: "lint",
              cmd: `${NODE} -e "console.log('src/foo.ts:10:5: Cannot find name foo'); process.exit(1);"`,
              timeout_ms: 5_000,
              adapter: "generic"
            }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const r = startCheck(deps, { name: "pipeline" });
    await r.done;

    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.error_count).toBe(1);
    expect(s.group_count).toBe(1);
    expect(s.top_groups[0].message).toMatch(/Cannot find name/);
  });

  it("tags each error group with step name when multi-step", async () => {
    const deps: ChecksDeps = {
      config: configWith({
        pipeline: {
          steps: [
            {
              name: "first",
              cmd: `${NODE} -e "console.log('src/a.ts:1:1: error A'); process.exit(1);"`,
              timeout_ms: 5_000,
              adapter: "generic"
            }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const r = startCheck(deps, { name: "pipeline" });
    await r.done;

    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.top_groups[0].step).toBe("first");
  });

  it("does NOT add step field when single-cmd check (backward compat)", async () => {
    const deps: ChecksDeps = {
      config: configWith({
        single: {
          cmd: `${NODE} -e "console.log('src/a.ts:1:1: error A'); process.exit(1);"`,
          timeout_ms: 5_000,
          adapter: "generic"
        }
      }),
      storage,
      runner
    };
    const r = startCheck(deps, { name: "single" });
    await r.done;

    const s = summarizeRun(deps, { run_id: r.run_id });
    expect(s.kind).toBeUndefined();
    expect(s.steps).toBeUndefined();
    expect(s.top_groups[0].step).toBeUndefined();
  });
});
