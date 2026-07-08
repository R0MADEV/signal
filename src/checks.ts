import { resolve } from "node:path";
import { isMultiStep, type Config } from "./config.js";
import type { Storage, RunMeta } from "./storage.js";
import type { Runner } from "./runner.js";
import { summarizeRun } from "./summary.js";

export interface ChecksDeps {
  config: Config;
  storage: Storage;
  runner: Runner;
}

export interface StartCheckResult {
  run_id: string;
  status: "running";
  done: Promise<RunMeta>;
}

export function startCheck(deps: ChecksDeps, args: { name: string }): StartCheckResult {
  if (typeof args.name !== "string" || args.name.length === 0) {
    throw new Error("startCheck: name must be a non-empty string");
  }
  const check = deps.config.checks[args.name];
  if (!check) {
    const available = Object.keys(deps.config.checks).join(", ") || "(none configured)";
    throw new Error(`Unknown check: ${args.name}. Available: ${available}`);
  }

  const projectRoot = resolve(deps.config.root);

  if (isMultiStep(check)) {
    const baseCwd = check.cwd ? resolve(projectRoot, check.cwd) : projectRoot;
    const { meta } = deps.storage.createMultiStepRun({
      check: args.name,
      steps: check.steps.map((s) => ({
        name: s.name,
        cmd: s.cmd,
        cwd: s.cwd ? resolve(baseCwd, s.cwd) : baseCwd,
        timeout_ms: s.timeout_ms,
        on_failure: s.on_failure
      })),
      cwd: baseCwd,
      fail_fast: check.fail_fast
    });
    const handle = deps.runner.runSequence({
      run_id: meta.run_id,
      env: check.env
    });
    return { run_id: handle.run_id, status: "running", done: handle.done };
  }

  const cwd = check.cwd ? resolve(projectRoot, check.cwd) : projectRoot;
  const handle = deps.runner.start({
    name: args.name,
    cmd: check.cmd,
    cwd,
    timeout_ms: check.timeout_ms,
    env: check.env,
    on_failure_cmd: check.on_failure
  });
  return { run_id: handle.run_id, status: "running", done: handle.done };
}

export async function runCheck(
  deps: ChecksDeps,
  args: { name: string; max_groups?: number; max_occurrences?: number; max_wait_ms?: number }
) {
  const result = startCheck(deps, { name: args.name });
  result.done.catch((err) => {
    console.error(`[signal-mcp] runCheck ${result.run_id} rejected:`, err);
  });

  if (args.max_wait_ms !== undefined) {
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, args.max_wait_ms));
    await Promise.race([result.done, timeout]);
  } else {
    await result.done;
  }

  return summarizeRun(deps, {
    run_id: result.run_id,
    max_groups: args.max_groups,
    max_occurrences: args.max_occurrences
  });
}

export function getRunStatus(deps: ChecksDeps, args: { run_id: string }): RunMeta {
  return deps.storage.readMeta(args.run_id);
}

export function listRuns(deps: ChecksDeps, args: { check?: string }): RunMeta[] {
  return deps.storage.listRuns(args.check ? { check: args.check } : undefined);
}
