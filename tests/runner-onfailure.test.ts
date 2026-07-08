import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-onfail-"));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Runner.start with on_failure", () => {
  it("does NOT run on_failure when the main cmd succeeds", async () => {
    const handle = runner.start({
      name: "ok",
      cmd: `${NODE} -e "console.log('hi')"`,
      cwd: root,
      timeout_ms: 5_000,
      on_failure_cmd: `${NODE} -e "console.log('SHOULD-NOT-RUN')"`
    });
    await handle.done;
    const meta = storage.readMeta(handle.run_id);
    if (meta.kind !== "single") throw new Error("expected single");
    expect(meta.status).toBe("completed");
    expect(meta.on_failure_status).toBeNull();
    const paths = storage.pathsFor(handle.run_id);
    if (existsSync(paths.onFailureStdout)) {
      expect(readFileSync(paths.onFailureStdout, "utf8")).toBe("");
    }
  });

  it("runs on_failure when the main cmd fails and captures its log", async () => {
    const handle = runner.start({
      name: "fail",
      cmd: `${NODE} -e "process.exit(2)"`,
      cwd: root,
      timeout_ms: 5_000,
      on_failure_cmd: `${NODE} -e "console.log('captured-context')"`
    });
    await handle.done;
    const meta = storage.readMeta(handle.run_id);
    if (meta.kind !== "single") throw new Error("expected single");
    expect(meta.status).toBe("failed");
    expect(meta.on_failure_status).toBe("completed");
    expect(meta.on_failure_exit_code).toBe(0);
    expect(meta.on_failure_duration_ms).toBeGreaterThanOrEqual(0);
    const paths = storage.pathsFor(handle.run_id);
    expect(readFileSync(paths.onFailureStdout, "utf8")).toContain("captured-context");
  });

  it("on_failure failure does not crash the run; reports its own status", async () => {
    const handle = runner.start({
      name: "fail",
      cmd: `${NODE} -e "process.exit(1)"`,
      cwd: root,
      timeout_ms: 5_000,
      on_failure_cmd: `${NODE} -e "process.exit(7)"`
    });
    await handle.done;
    const meta = storage.readMeta(handle.run_id);
    if (meta.kind !== "single") throw new Error("expected single");
    expect(meta.status).toBe("failed");
    expect(meta.on_failure_status).toBe("failed");
    expect(meta.on_failure_exit_code).toBe(7);
  });
});

describe("Runner.runSequence with per-step on_failure", () => {
  it("runs the failing step's on_failure and writes log to step's on_failure files", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "ok", cmd: `${NODE} -e "console.log('ok')"`, timeout_ms: 5_000 },
        {
          name: "broken",
          cmd: `${NODE} -e "process.exit(3)"`,
          timeout_ms: 5_000,
          on_failure: `${NODE} -e "console.log('broken-ctx')"`
        }
      ],
      cwd: root,
      fail_fast: true
    });
    const final = await runner.runSequence({ run_id: meta.run_id }).done;
    expect(final.steps[0].status).toBe("completed");
    expect(final.steps[0].on_failure_status).toBeNull();
    expect(final.steps[1].status).toBe("failed");
    expect(final.steps[1].on_failure_status).toBe("completed");

    const stepPaths = storage.pathsForStep(meta.run_id, 1);
    expect(readFileSync(stepPaths.onFailureStdout, "utf8")).toContain("broken-ctx");
  });

  it("does NOT run on_failure for steps that completed successfully", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        {
          name: "ok",
          cmd: `${NODE} -e "console.log('ok')"`,
          timeout_ms: 5_000,
          on_failure: `${NODE} -e "console.log('SHOULD-NOT-RUN')"`
        }
      ],
      cwd: root,
      fail_fast: true
    });
    const final = await runner.runSequence({ run_id: meta.run_id }).done;
    expect(final.steps[0].status).toBe("completed");
    expect(final.steps[0].on_failure_status).toBeNull();
    const stepPaths = storage.pathsForStep(meta.run_id, 0);
    if (existsSync(stepPaths.onFailureStdout)) {
      expect(readFileSync(stepPaths.onFailureStdout, "utf8")).toBe("");
    }
  });
});
