import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-msrun-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Storage.createMultiStepRun", () => {
  it("creates the run dir and one subdir per step", () => {
    const storage = new Storage(root);
    const { meta, paths } = storage.createMultiStepRun({
      check: "behat",
      steps: [
        { name: "clean", cmd: "rm -rf var", timeout_ms: 1000 },
        { name: "prepare", cmd: "bin/preparedb", timeout_ms: 60000 },
        { name: "test", cmd: "vendor/bin/behat", timeout_ms: 120000 }
      ],
      cwd: root,
      fail_fast: true
    });

    expect(existsSync(paths.dir)).toBe(true);
    expect(existsSync(paths.meta)).toBe(true);
    expect(meta.run_id).toContain("behat");
    expect(meta.status).toBe("running");
    expect(meta.kind).toBe("multi-step");
    expect(meta.fail_fast).toBe(true);
    expect(meta.steps).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(meta.steps[i].status).toBe("pending");
      expect(meta.steps[i].index).toBe(i);
    }
  });

  it("creates step subdirs with empty stdout, stderr, meta", () => {
    const storage = new Storage(root);
    const { paths } = storage.createMultiStepRun({
      check: "x",
      steps: [{ name: "a", cmd: "echo", timeout_ms: 1000 }],
      cwd: root,
      fail_fast: true
    });

    const stepPaths = storage.pathsForStep(paths.dir.split("/").pop()!, 0);
    expect(existsSync(stepPaths.dir)).toBe(true);
    expect(existsSync(stepPaths.stdout)).toBe(true);
    expect(existsSync(stepPaths.stderr)).toBe(true);
    expect(existsSync(stepPaths.meta)).toBe(true);
    expect(readFileSync(stepPaths.stdout, "utf8")).toBe("");
    expect(readFileSync(stepPaths.stderr, "utf8")).toBe("");
  });

  it("step subdirs are named '<index+1>-<step_name>' for sortability", () => {
    const storage = new Storage(root);
    const { paths } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "first", cmd: "a", timeout_ms: 1000 },
        { name: "second", cmd: "b", timeout_ms: 1000 }
      ],
      cwd: root,
      fail_fast: true
    });

    const step1 = storage.pathsForStep(paths.dir.split("/").pop()!, 0);
    const step2 = storage.pathsForStep(paths.dir.split("/").pop()!, 1);
    expect(step1.dir).toMatch(/\/1-first$/);
    expect(step2.dir).toMatch(/\/2-second$/);
  });

  it("rejects invalid check name", () => {
    const storage = new Storage(root);
    expect(() =>
      storage.createMultiStepRun({
        check: "../escape",
        steps: [{ name: "a", cmd: "x", timeout_ms: 1000 }],
        cwd: root,
        fail_fast: true
      })
    ).toThrow();
  });

  it("rejects empty steps array", () => {
    const storage = new Storage(root);
    expect(() =>
      storage.createMultiStepRun({
        check: "x",
        steps: [],
        cwd: root,
        fail_fast: true
      })
    ).toThrow();
  });

  it("rejects step with invalid name", () => {
    const storage = new Storage(root);
    expect(() =>
      storage.createMultiStepRun({
        check: "x",
        steps: [{ name: "a/b", cmd: "x", timeout_ms: 1000 }],
        cwd: root,
        fail_fast: true
      })
    ).toThrow();
  });
});

describe("Storage.updateStepMeta", () => {
  it("updates a step's status and persists to step's meta.json", () => {
    const storage = new Storage(root);
    const { meta, paths } = storage.createMultiStepRun({
      check: "x",
      steps: [{ name: "a", cmd: "echo", timeout_ms: 1000 }],
      cwd: root,
      fail_fast: true
    });

    const updated = storage.updateStepMeta(meta.run_id, 0, {
      status: "completed",
      exit_code: 0,
      duration_ms: 50
    });
    expect(updated.status).toBe("completed");

    const stepPaths = storage.pathsForStep(meta.run_id, 0);
    const fromDisk = JSON.parse(readFileSync(stepPaths.meta, "utf8"));
    expect(fromDisk.status).toBe("completed");

    const globalAfter = storage.readMeta(meta.run_id);
    expect(globalAfter.kind).toBe("multi-step");
    if (globalAfter.kind === "multi-step") {
      expect(globalAfter.steps[0].status).toBe("completed");
      expect(globalAfter.steps[0].exit_code).toBe(0);
    }
  });

  it("rejects step_index out of range", () => {
    const storage = new Storage(root);
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [{ name: "a", cmd: "echo", timeout_ms: 1000 }],
      cwd: root,
      fail_fast: true
    });
    expect(() =>
      storage.updateStepMeta(meta.run_id, 5, { status: "completed" })
    ).toThrow();
  });
});

describe("Storage.readLogSlice for multi-step runs", () => {
  it("can read from a step's stdout via pathsForStep", () => {
    const storage = new Storage(root);
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [
        { name: "a", cmd: "echo a", timeout_ms: 1000 },
        { name: "b", cmd: "echo b", timeout_ms: 1000 }
      ],
      cwd: root,
      fail_fast: true
    });

    const step1Paths = storage.pathsForStep(meta.run_id, 0);
    writeFileSync(step1Paths.stdout, "line1\nline2\nline3\n");

    const slice = storage.readLogSlice({
      run_id: meta.run_id,
      stream: "stdout",
      step_index: 0
    });
    expect(slice.lines).toEqual(["line1", "line2", "line3"]);
    expect(slice.total_lines).toBe(3);
  });

  it("rejects step_index out of range when reading log slice", () => {
    const storage = new Storage(root);
    const { meta } = storage.createMultiStepRun({
      check: "x",
      steps: [{ name: "a", cmd: "echo", timeout_ms: 1000 }],
      cwd: root,
      fail_fast: true
    });
    expect(() =>
      storage.readLogSlice({ run_id: meta.run_id, stream: "stdout", step_index: 5 })
    ).toThrow();
  });
});
