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
  root = mkdtempSync(join(tmpdir(), "signal-runner-"));
  storage = new Storage(root);
  runner = new Runner(storage);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Runner", () => {
  describe("start", () => {
    it("returns run_id immediately without blocking on the process", async () => {
      const handle = runner.start({
        name: "echo",
        cmd: `${NODE} -e "setTimeout(() => {}, 200)"`,
        cwd: root,
        timeout_ms: 5_000
      });
      expect(handle.run_id).toContain("echo");
      expect(storage.readMeta(handle.run_id).status).toBe("running");
      await handle.done;
    });

    it("marks completed with exit_code 0 on success", async () => {
      const handle = runner.start({
        name: "ok",
        cmd: `${NODE} -e "console.log('hi')"`,
        cwd: root,
        timeout_ms: 5_000
      });
      await handle.done;
      const meta = storage.readMeta(handle.run_id);
      expect(meta.status).toBe("completed");
      expect(meta.exit_code).toBe(0);
      expect(meta.finished_at).not.toBeNull();
      expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("captures stdout to disk", async () => {
      const handle = runner.start({
        name: "out",
        cmd: `${NODE} -e "console.log('hello-stdout')"`,
        cwd: root,
        timeout_ms: 5_000
      });
      await handle.done;
      const paths = storage.pathsFor(handle.run_id);
      expect(readFileSync(paths.stdout, "utf8")).toContain("hello-stdout");
    });

    it("captures stderr to disk", async () => {
      const handle = runner.start({
        name: "err",
        cmd: `${NODE} -e "console.error('hello-stderr')"`,
        cwd: root,
        timeout_ms: 5_000
      });
      await handle.done;
      const paths = storage.pathsFor(handle.run_id);
      expect(readFileSync(paths.stderr, "utf8")).toContain("hello-stderr");
    });

    it("marks failed with non-zero exit_code", async () => {
      const handle = runner.start({
        name: "fail",
        cmd: `${NODE} -e "process.exit(2)"`,
        cwd: root,
        timeout_ms: 5_000
      });
      await handle.done;
      const meta = storage.readMeta(handle.run_id);
      expect(meta.status).toBe("failed");
      expect(meta.exit_code).toBe(2);
    });

    it("marks timeout when process exceeds timeout_ms", async () => {
      const handle = runner.start({
        name: "slow",
        cmd: `${NODE} -e "setTimeout(() => {}, 5000)"`,
        cwd: root,
        timeout_ms: 150
      });
      await handle.done;
      const meta = storage.readMeta(handle.run_id);
      expect(meta.status).toBe("timeout");
    });

    it("rejects empty cmd (delegated guard from Storage)", () => {
      expect(() =>
        runner.start({ name: "x", cmd: "", cwd: root, timeout_ms: 1000 })
      ).toThrow();
    });

    it("rejects non-positive timeout_ms (delegated guard from Storage)", () => {
      expect(() =>
        runner.start({ name: "x", cmd: `${NODE} -e ""`, cwd: root, timeout_ms: 0 })
      ).toThrow();
    });

    it("rejects invalid check name (delegated guard from Storage)", () => {
      expect(() =>
        runner.start({ name: "../escape", cmd: `${NODE} -e ""`, cwd: root, timeout_ms: 1000 })
      ).toThrow();
    });
  });

  describe("constructor", () => {
    it("rejects missing storage", () => {
      expect(() => new Runner(undefined as unknown as Storage)).toThrow();
    });
  });
});
