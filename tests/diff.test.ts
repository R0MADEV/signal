import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, type ChecksDeps } from "../src/checks.js";
import { diffRuns } from "../src/diff.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;
let deps: ChecksDeps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-diff-"));
  storage = new Storage(root);
  runner = new Runner(storage);
  deps = {
    config: {
      root,
      checks: {
        same_a: {
          cmd: `${NODE} -e "console.log('src/a.ts:1:1: error A')"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        same_b: {
          cmd: `${NODE} -e "console.log('src/a.ts:1:1: error A')"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        introduces_b: {
          cmd: `${NODE} -e "console.log('src/a.ts:1:1: error A'); console.log('src/b.ts:2:1: error B')"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        removes_a: {
          cmd: `${NODE} -e "console.log('src/b.ts:2:1: error B')"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        bursty_3: {
          cmd: `${NODE} -e "for (let i=0;i<3;i++) console.log('src/x.ts:'+i+':1: same shape '+i)"`,
          timeout_ms: 5_000,
          adapter: "generic"
        },
        bursty_5: {
          cmd: `${NODE} -e "for (let i=0;i<5;i++) console.log('src/x.ts:'+i+':1: same shape '+i)"`,
          timeout_ms: 5_000,
          adapter: "generic"
        }
      }
    } as Config,
    storage,
    runner
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function runOnce(name: string): Promise<string> {
  const r = startCheck(deps, { name });
  await r.done;
  return r.run_id;
}

describe("diffRuns", () => {
  it("throws when neither run_ids nor check is provided", () => {
    expect(() => diffRuns(deps, {})).toThrow();
  });

  it("throws when check has fewer than 2 runs", async () => {
    await runOnce("same_a");
    expect(() => diffRuns(deps, { check: "same_a" })).toThrow(/at least 2 runs/i);
  });

  it("returns no added/removed when runs produce identical errors", async () => {
    const prev = await runOnce("same_a");
    const next = await runOnce("same_b");
    const result = diffRuns(deps, { prev_run_id: prev, next_run_id: next });
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.persisting).toHaveLength(1);
    expect(result.stats.persisting_count).toBe(1);
  });

  it("detects an added group when next introduces a new error", async () => {
    const prev = await runOnce("same_a");
    const next = await runOnce("introduces_b");
    const result = diffRuns(deps, { prev_run_id: prev, next_run_id: next });
    expect(result.added).toHaveLength(1);
    expect(result.removed).toEqual([]);
    expect(result.persisting).toHaveLength(1);
  });

  it("detects a removed group when next fixes a prior error", async () => {
    const prev = await runOnce("introduces_b");
    const next = await runOnce("removes_a");
    const result = diffRuns(deps, { prev_run_id: prev, next_run_id: next });
    expect(result.removed).toHaveLength(1);
    expect(result.added).toEqual([]);
    expect(result.persisting).toHaveLength(1);
  });

  it("computes delta on persisting groups", async () => {
    const prev = await runOnce("bursty_3");
    const next = await runOnce("bursty_5");
    const result = diffRuns(deps, { prev_run_id: prev, next_run_id: next });
    expect(result.persisting).toHaveLength(1);
    const p = result.persisting[0];
    expect(p.prev_count).toBe(3);
    expect(p.next_count).toBe(5);
    expect(p.delta).toBe(2);
  });

  it("auto-selects the two latest runs when only check is provided", async () => {
    const first = await runOnce("same_a");
    const second = await runOnce("same_a");
    const result = diffRuns(deps, { check: "same_a" });
    expect(result.next_run_id).toBe(second);
    expect(result.prev_run_id).toBe(first);
  });

  it("respects max_per_section truncation", async () => {
    const prev = await runOnce("same_a");
    const next = await runOnce("introduces_b");
    const result = diffRuns(deps, { prev_run_id: prev, next_run_id: next, max_per_section: 0 });
    expect(result.added).toEqual([]);
    expect(result.stats.added_count).toBe(1);
  });
});
