import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import { startCheck, getRunStatus, listRuns, runCheck, type ChecksDeps } from "../src/checks.js";
import type { Config } from "../src/config.js";

const NODE = JSON.stringify(process.execPath);

let root: string;
let storage: Storage;
let runner: Runner;
let deps: ChecksDeps;

function makeConfig(root: string): Config {
  return {
    root,
    checks: {
      echo: {
        cmd: `${NODE} -e "console.log('ok')"`,
        timeout_ms: 5_000,
        adapter: "generic"
      },
      slow: {
        cmd: `${NODE} -e "setTimeout(() => {}, 200)"`,
        timeout_ms: 5_000,
        adapter: "generic"
      }
    }
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-checks-"));
  storage = new Storage(root);
  runner = new Runner(storage);
  deps = { config: makeConfig(root), storage, runner };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("startCheck", () => {
  it("returns run_id and running status for known check", async () => {
    const result = startCheck(deps, { name: "echo" });
    expect(result.run_id).toContain("echo");
    expect(result.status).toBe("running");
    await result.done;
  });

  it("rejects unknown check with informative error", () => {
    expect(() => startCheck(deps, { name: "nope" })).toThrow(/Unknown check.*nope/);
  });

  it("rejects empty name", () => {
    expect(() => startCheck(deps, { name: "" })).toThrow();
  });
});

describe("getRunStatus", () => {
  it("returns meta for valid run_id while still running", () => {
    const result = startCheck(deps, { name: "slow" });
    const meta = getRunStatus(deps, { run_id: result.run_id });
    expect(meta.run_id).toBe(result.run_id);
    expect(meta.status).toBe("running");
    return result.done;
  });

  it("returns meta with completed status after run finishes", async () => {
    const result = startCheck(deps, { name: "echo" });
    await result.done;
    const meta = getRunStatus(deps, { run_id: result.run_id });
    expect(meta.status).toBe("completed");
    expect(meta.exit_code).toBe(0);
  });

  it("rejects unknown run_id", () => {
    expect(() => getRunStatus(deps, { run_id: "unknown_run" })).toThrow();
  });
});

describe("runCheck", () => {
  it("returns a completed summary without polling", async () => {
    const summary = await runCheck(deps, { name: "echo" });
    expect(summary.status).toBe("completed");
    expect(summary.run_id).toContain("echo");
  });

  it("returns still_running with run_id when max_wait_ms is exceeded", async () => {
    const resultPromise = runCheck(deps, { name: "slow", max_wait_ms: 50 });
    const result = await resultPromise;
    expect(result.status).toBe("running");
    expect(result.run_id).toContain("slow");
  });

  it("returns summary when check completes before max_wait_ms", async () => {
    const summary = await runCheck(deps, { name: "echo", max_wait_ms: 5000 });
    expect(summary.status).toBe("completed");
  });

  it("returns failed summary when command exits non-zero", async () => {
    deps.config.checks.fail = {
      cmd: `${NODE} -e "process.exit(1)"`,
      timeout_ms: 5_000,
      adapter: "generic"
    };
    const summary = await runCheck(deps, { name: "fail" });
    expect(summary.status).toBe("failed");
  });

  it("rejects unknown check", async () => {
    await expect(runCheck(deps, { name: "nope" })).rejects.toThrow(/Unknown check/);
  });
});

describe("listRuns", () => {
  it("returns empty list when no runs exist", () => {
    expect(listRuns(deps, {})).toEqual([]);
  });

  it("returns one entry after a single run", async () => {
    const r = startCheck(deps, { name: "echo" });
    await r.done;
    const runs = listRuns(deps, {});
    expect(runs.length).toBe(1);
    expect(runs[0].check).toBe("echo");
  });

  it("filters by check name", async () => {
    const a = startCheck(deps, { name: "echo" });
    const b = startCheck(deps, { name: "slow" });
    await Promise.all([a.done, b.done]);
    const onlyEcho = listRuns(deps, { check: "echo" });
    expect(onlyEcho.length).toBe(1);
    expect(onlyEcho[0].check).toBe("echo");
  });
});
