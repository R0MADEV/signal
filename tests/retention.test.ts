import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { applyRetention } from "../src/retention.js";

let root: string;
let storage: Storage;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-retention-"));
  storage = new Storage(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function createRun(check: string): string {
  return storage.createRun({
    check,
    cmd: "echo",
    cwd: root,
    timeout_ms: 1000
  }).meta.run_id;
}

describe("Storage.deleteRun", () => {
  it("removes a run directory entirely", () => {
    const id = createRun("x");
    const paths = storage.pathsFor(id);
    expect(existsSync(paths.dir)).toBe(true);
    storage.deleteRun(id);
    expect(existsSync(paths.dir)).toBe(false);
  });

  it("is idempotent (no error if run does not exist)", () => {
    expect(() => storage.deleteRun("nonexistent_run_id")).not.toThrow();
  });

  it("rejects invalid run_id", () => {
    expect(() => storage.deleteRun("../escape")).toThrow();
    expect(() => storage.deleteRun("a/b")).toThrow();
  });
});

describe("applyRetention with DEFAULT_RETENTION", () => {
  it("DEFAULT_RETENTION keeps last 20 runs per check", async () => {
    const { DEFAULT_RETENTION } = await import("../src/retention.js");
    for (let i = 0; i < 25; i++) {
      createRun("foo");
      await new Promise((r) => setTimeout(r, 2));
    }
    const result = applyRetention(storage, DEFAULT_RETENTION);
    expect(result.removed).toBe(5);
    expect(storage.listRuns().length).toBe(20);
  });
});

describe("applyRetention", () => {
  it("does nothing with empty policy", () => {
    for (let i = 0; i < 5; i++) createRun("foo");
    const result = applyRetention(storage, {});
    expect(result.removed).toBe(0);
    expect(storage.listRuns().length).toBe(5);
  });

  it("keeps the N most recent runs per check", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(createRun("foo"));
      await new Promise((r) => setTimeout(r, 5));
    }
    const result = applyRetention(storage, { max_runs_per_check: 3 });
    expect(result.removed).toBe(5);
    const remaining = storage.listRuns();
    expect(remaining.length).toBe(3);
    const remainingIds = remaining.map((r) => r.run_id);
    expect(remainingIds).toContain(ids[7]);
    expect(remainingIds).toContain(ids[6]);
    expect(remainingIds).toContain(ids[5]);
    expect(remainingIds).not.toContain(ids[0]);
  });

  it("keeps separate counts per check", async () => {
    for (let i = 0; i < 6; i++) {
      createRun("foo");
      await new Promise((r) => setTimeout(r, 2));
      createRun("bar");
      await new Promise((r) => setTimeout(r, 2));
    }
    applyRetention(storage, { max_runs_per_check: 2 });
    const remaining = storage.listRuns();
    expect(remaining.length).toBe(4);
    const fooCount = remaining.filter((r) => r.check === "foo").length;
    const barCount = remaining.filter((r) => r.check === "bar").length;
    expect(fooCount).toBe(2);
    expect(barCount).toBe(2);
  });

  it("removes runs older than max_age_days", async () => {
    const oldId = createRun("foo");
    const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    storage.updateMeta(oldId, { started_at: oldDate });

    const newId = createRun("foo");

    const result = applyRetention(storage, { max_age_days: 2 });
    expect(result.removed).toBe(1);
    const remaining = storage.listRuns();
    expect(remaining.map((r) => r.run_id)).toEqual([newId]);
  });

  it("combines max_runs_per_check and max_age_days correctly", async () => {
    const oldId = createRun("foo");
    storage.updateMeta(oldId, {
      started_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });
    for (let i = 0; i < 4; i++) {
      createRun("foo");
      await new Promise((r) => setTimeout(r, 2));
    }
    const result = applyRetention(storage, {
      max_runs_per_check: 2,
      max_age_days: 7
    });
    expect(result.removed).toBe(3);
    expect(storage.listRuns().length).toBe(2);
  });

  it("returns 0 removed when nothing to clean", () => {
    createRun("foo");
    const result = applyRetention(storage, { max_runs_per_check: 100 });
    expect(result.removed).toBe(0);
  });
});
