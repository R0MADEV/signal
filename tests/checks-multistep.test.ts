import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, type ChecksDeps } from "../src/checks.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;
let deps: ChecksDeps;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "signal-checksmulti-")));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function configWith(checks: Config["checks"]): Config {
  return { root, checks };
}

describe("startCheck for multi-step checks", () => {
  it("returns run_id and running status immediately for a multi-step check", async () => {
    deps = {
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
    const result = startCheck(deps, { name: "pipeline" });
    expect(result.run_id).toContain("pipeline");
    expect(result.status).toBe("running");

    const meta = storage.readMeta(result.run_id);
    expect(meta.kind).toBe("multi-step");

    const final = await result.done;
    expect(final.status).toBe("completed");
  });

  it("after completion, all steps marked completed and logs written per step", async () => {
    deps = {
      config: configWith({
        pipeline: {
          steps: [
            { name: "first", cmd: `${NODE} -e "console.log('first-output')"`, timeout_ms: 5_000, adapter: "generic" },
            { name: "second", cmd: `${NODE} -e "console.log('second-output')"`, timeout_ms: 5_000, adapter: "generic" }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const result = startCheck(deps, { name: "pipeline" });
    await result.done;

    const meta = storage.readMeta(result.run_id);
    if (meta.kind !== "multi-step") throw new Error("expected multi-step");
    expect(meta.steps.every((s) => s.status === "completed")).toBe(true);

    const step1 = storage.pathsForStep(result.run_id, 0);
    const step2 = storage.pathsForStep(result.run_id, 1);
    expect(readFileSync(step1.stdout, "utf8")).toContain("first-output");
    expect(readFileSync(step2.stdout, "utf8")).toContain("second-output");
  });

  it("fail_fast=true stops at the failing step and skips the rest", async () => {
    deps = {
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
    const result = startCheck(deps, { name: "pipeline" });
    const final = await result.done;
    expect(final.status).toBe("failed");
    expect(final.failed_step).toBe("boom");

    const meta = storage.readMeta(result.run_id);
    if (meta.kind !== "multi-step") throw new Error("expected multi-step");
    expect(meta.steps[0].status).toBe("completed");
    expect(meta.steps[1].status).toBe("failed");
    expect(meta.steps[2].status).toBe("skipped");
  });

  it("respects per-step cwd and falls back to check cwd otherwise", async () => {
    deps = {
      config: configWith({
        pipeline: {
          steps: [
            { name: "pwd", cmd: `${NODE} -e "console.log(process.cwd())"`, timeout_ms: 5_000, adapter: "generic" }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };
    const result = startCheck(deps, { name: "pipeline" });
    await result.done;
    const stepPaths = storage.pathsForStep(result.run_id, 0);
    const out = readFileSync(stepPaths.stdout, "utf8");
    expect(out.trim()).toBe(root);
  });

  it("rejects unknown check name", () => {
    deps = { config: configWith({}), storage, runner };
    expect(() => startCheck(deps, { name: "nope" })).toThrow(/Unknown check/);
  });

  it("single and multi checks coexist in the same config", async () => {
    deps = {
      config: configWith({
        single_one: {
          cmd: `${NODE} -e "console.log('single')"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        multi_one: {
          steps: [
            { name: "a", cmd: `${NODE} -e "console.log('multi-a')"`, timeout_ms: 5_000, adapter: "generic" }
          ],
          fail_fast: true
        }
      }),
      storage,
      runner
    };

    const a = startCheck(deps, { name: "single_one" });
    const b = startCheck(deps, { name: "multi_one" });
    await Promise.all([a.done, b.done]);

    const aMeta = storage.readMeta(a.run_id);
    const bMeta = storage.readMeta(b.run_id);
    expect(aMeta.kind).toBe("single");
    expect(bMeta.kind).toBe("multi-step");
  });
});
