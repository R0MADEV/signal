import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Storage", () => {
  describe("constructor", () => {
    it("rejects empty root", () => {
      expect(() => new Storage("")).toThrow();
    });
  });

  describe("createRun", () => {
    it("creates run dir with stdout, stderr, meta files and running status", () => {
      const storage = new Storage(root);
      const { meta, paths } = storage.createRun({
        check: "phpstan",
        cmd: "phpstan analyse",
        cwd: root,
        timeout_ms: 60_000
      });

      expect(existsSync(paths.dir)).toBe(true);
      expect(existsSync(paths.stdout)).toBe(true);
      expect(existsSync(paths.stderr)).toBe(true);
      expect(existsSync(paths.meta)).toBe(true);

      expect(meta.status).toBe("running");
      expect(meta.exit_code).toBeNull();
      expect(meta.finished_at).toBeNull();
      expect(meta.duration_ms).toBeNull();
      expect(meta.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(meta.run_id).toContain("phpstan");
    });

    it("produces unique run_ids for sequential runs of same check", () => {
      const storage = new Storage(root);
      const a = storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: 1000 });
      const b = storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: 1000 });
      expect(a.meta.run_id).not.toBe(b.meta.run_id);
    });

    it("rejects empty check name", () => {
      const storage = new Storage(root);
      expect(() =>
        storage.createRun({ check: "", cmd: "x", cwd: root, timeout_ms: 1000 })
      ).toThrow();
    });

    it("rejects empty cmd", () => {
      const storage = new Storage(root);
      expect(() =>
        storage.createRun({ check: "phpstan", cmd: "", cwd: root, timeout_ms: 1000 })
      ).toThrow();
    });

    it("rejects non-positive timeout_ms", () => {
      const storage = new Storage(root);
      expect(() =>
        storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: 0 })
      ).toThrow();
      expect(() =>
        storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: -1 })
      ).toThrow();
    });

    it("rejects check name with path separator or traversal", () => {
      const storage = new Storage(root);
      expect(() =>
        storage.createRun({ check: "../escape", cmd: "x", cwd: root, timeout_ms: 1000 })
      ).toThrow();
      expect(() =>
        storage.createRun({ check: "a/b", cmd: "x", cwd: root, timeout_ms: 1000 })
      ).toThrow();
    });
  });

  describe("readMeta", () => {
    it("reads meta written by createRun", () => {
      const storage = new Storage(root);
      const { meta } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      expect(storage.readMeta(meta.run_id)).toEqual(meta);
    });

    it("rejects unknown run_id", () => {
      const storage = new Storage(root);
      expect(() => storage.readMeta("unknown_run")).toThrow();
    });

    it("rejects run_id with path traversal", () => {
      const storage = new Storage(root);
      expect(() => storage.readMeta("../escape")).toThrow();
      expect(() => storage.readMeta("a/b")).toThrow();
    });
  });

  describe("updateMeta", () => {
    it("merges patch and persists to disk", () => {
      const storage = new Storage(root);
      const { meta } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      const updated = storage.updateMeta(meta.run_id, {
        status: "completed",
        exit_code: 0,
        duration_ms: 100
      });
      expect(updated.status).toBe("completed");
      expect(updated.exit_code).toBe(0);
      expect(updated.duration_ms).toBe(100);
      expect(updated.check).toBe(meta.check);
      expect(storage.readMeta(meta.run_id).status).toBe("completed");
    });

    it("rejects unknown run_id", () => {
      const storage = new Storage(root);
      expect(() => storage.updateMeta("unknown", { status: "completed" })).toThrow();
    });
  });

  describe("listRuns", () => {
    it("returns [] when no runs exist", () => {
      const storage = new Storage(root);
      expect(storage.listRuns()).toEqual([]);
    });

    it("returns runs sorted by started_at descending", async () => {
      const storage = new Storage(root);
      const a = storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: 1000 });
      await new Promise((r) => setTimeout(r, 10));
      const b = storage.createRun({ check: "phpunit", cmd: "y", cwd: root, timeout_ms: 1000 });
      const list = storage.listRuns();
      expect(list.map((r) => r.run_id)).toEqual([b.meta.run_id, a.meta.run_id]);
    });

    it("filters by check name", () => {
      const storage = new Storage(root);
      storage.createRun({ check: "phpstan", cmd: "x", cwd: root, timeout_ms: 1000 });
      storage.createRun({ check: "phpunit", cmd: "y", cwd: root, timeout_ms: 1000 });
      const list = storage.listRuns({ check: "phpstan" });
      expect(list.length).toBe(1);
      expect(list[0].check).toBe("phpstan");
    });
  });

  describe("readLogSlice", () => {
    it("returns lines in 1-indexed range", () => {
      const storage = new Storage(root);
      const { meta, paths } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      writeFileSync(paths.stdout, "line1\nline2\nline3\nline4\nline5");
      const slice = storage.readLogSlice({
        run_id: meta.run_id,
        stream: "stdout",
        from_line: 2,
        to_line: 4
      });
      expect(slice.lines).toEqual(["line2", "line3", "line4"]);
      expect(slice.total_lines).toBe(5);
    });

    it("strips a single trailing newline so it is not counted as an empty line", () => {
      const storage = new Storage(root);
      const { meta, paths } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      writeFileSync(paths.stdout, "a\nb\nc\n");
      const slice = storage.readLogSlice({ run_id: meta.run_id, stream: "stdout" });
      expect(slice.total_lines).toBe(3);
      expect(slice.lines).toEqual(["a", "b", "c"]);
    });

    it("clamps from_line below 1 to 1", () => {
      const storage = new Storage(root);
      const { meta, paths } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      writeFileSync(paths.stdout, "a\nb\nc");
      const slice = storage.readLogSlice({
        run_id: meta.run_id,
        stream: "stdout",
        from_line: 0,
        to_line: 2
      });
      expect(slice.from_line).toBe(1);
      expect(slice.lines).toEqual(["a", "b"]);
    });

    it("clamps to_line above total to total", () => {
      const storage = new Storage(root);
      const { meta, paths } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      writeFileSync(paths.stdout, "a\nb\nc");
      const slice = storage.readLogSlice({
        run_id: meta.run_id,
        stream: "stdout",
        from_line: 1,
        to_line: 999
      });
      expect(slice.to_line).toBe(3);
      expect(slice.lines).toEqual(["a", "b", "c"]);
    });

    it("returns empty for empty log file", () => {
      const storage = new Storage(root);
      const { meta } = storage.createRun({
        check: "phpstan",
        cmd: "x",
        cwd: root,
        timeout_ms: 1000
      });
      const slice = storage.readLogSlice({ run_id: meta.run_id, stream: "stdout" });
      expect(slice.lines).toEqual([]);
      expect(slice.total_lines).toBe(0);
    });

    it("rejects unknown run_id", () => {
      const storage = new Storage(root);
      expect(() => storage.readLogSlice({ run_id: "unknown", stream: "stdout" })).toThrow();
    });
  });
});
