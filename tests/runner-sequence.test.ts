import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-runseq-"));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Runner.runSequence", () => {
  it("executes steps in order and marks all completed if every step succeeds", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "a", cmd: `${NODE} -e "console.log('a')"`, timeout_ms: 5_000 },
        { name: "b", cmd: `${NODE} -e "console.log('b')"`, timeout_ms: 5_000 }
      ],
      cwd: root,
      fail_fast: true
    });
    const handle = runner.runSequence({ run_id: meta.run_id });
    const final = await handle.done;
    expect(final.kind).toBe("multi-step");
    expect(final.status).toBe("completed");
    expect(final.exit_code).toBe(0);
    expect(final.failed_step).toBeNull();
    expect(final.failed_step_index).toBeNull();
    expect(final.steps[0].status).toBe("completed");
    expect(final.steps[1].status).toBe("completed");
    expect(final.duration_ms).toBeGreaterThan(0);
  });

  it("fail_fast=true stops at the first failing step and marks rest skipped", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "a", cmd: `${NODE} -e "console.log('a')"`, timeout_ms: 5_000 },
        { name: "b", cmd: `${NODE} -e "process.exit(3)"`, timeout_ms: 5_000 },
        { name: "c", cmd: `${NODE} -e "console.log('c')"`, timeout_ms: 5_000 }
      ],
      cwd: root,
      fail_fast: true
    });
    const final = await runner.runSequence({ run_id: meta.run_id }).done;
    expect(final.status).toBe("failed");
    expect(final.exit_code).toBe(3);
    expect(final.failed_step).toBe("b");
    expect(final.failed_step_index).toBe(1);
    expect(final.steps[0].status).toBe("completed");
    expect(final.steps[1].status).toBe("failed");
    expect(final.steps[2].status).toBe("skipped");
  });

  it("fail_fast=false runs every step and reports overall failed if any failed", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "a", cmd: `${NODE} -e "process.exit(1)"`, timeout_ms: 5_000 },
        { name: "b", cmd: `${NODE} -e "console.log('b')"`, timeout_ms: 5_000 }
      ],
      cwd: root,
      fail_fast: false
    });
    const final = await runner.runSequence({ run_id: meta.run_id }).done;
    expect(final.status).toBe("failed");
    expect(final.failed_step).toBe("a");
    expect(final.steps[0].status).toBe("failed");
    expect(final.steps[1].status).toBe("completed");
  });

  it("captures each step's stdout/stderr to its own log file", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "a", cmd: `${NODE} -e "console.log('hello-a')"`, timeout_ms: 5_000 },
        { name: "b", cmd: `${NODE} -e "console.error('hello-b')"`, timeout_ms: 5_000 }
      ],
      cwd: root,
      fail_fast: true
    });
    await runner.runSequence({ run_id: meta.run_id }).done;
    const a = storage.pathsForStep(meta.run_id, 0);
    const b = storage.pathsForStep(meta.run_id, 1);
    expect(readFileSync(a.stdout, "utf8")).toContain("hello-a");
    expect(readFileSync(b.stderr, "utf8")).toContain("hello-b");
  });

  it("marks a step as timeout if it exceeds timeout_ms and aborts the rest with fail_fast", async () => {
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "slow", cmd: `${NODE} -e "setTimeout(() => {}, 5000)"`, timeout_ms: 150 },
        { name: "after", cmd: `${NODE} -e "console.log('after')"`, timeout_ms: 5_000 }
      ],
      cwd: root,
      fail_fast: true
    });
    const final = await runner.runSequence({ run_id: meta.run_id }).done;
    expect(final.steps[0].status).toBe("timeout");
    expect(final.steps[1].status).toBe("skipped");
    expect(final.status).toBe("failed");
    expect(final.failed_step).toBe("slow");
  });

  it("rejects unknown run_id at start (sync error from awaiting done)", async () => {
    await expect(runner.runSequence({ run_id: "unknown_run" }).done).rejects.toThrow();
  });

  it("rejects when run_id refers to a single-kind run", async () => {
    const { meta } = storage.createRun({
      check: "x",
      cmd: `${NODE} -e ""`,
      cwd: root,
      timeout_ms: 1_000
    });
    await expect(runner.runSequence({ run_id: meta.run_id }).done).rejects.toThrow(/multi-step/);
  });
});
