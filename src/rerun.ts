import { resolve } from "node:path";
import type { ChecksDeps } from "./checks.js";
import type { RunStatus } from "./storage.js";
import { isMultiStep } from "./config.js";
import { parsers, type AdapterName } from "./parsers/index.js";
import { computeRunGroups } from "./summary.js";

export interface RerunFailedArgs {
  run_id: string;
  fingerprint: string;
  timeout_ms?: number;
}

export interface RerunFailedResult {
  source_run_id: string;
  rerun_run_id: string;
  rerun_cmd: string;
  status: RunStatus;
  exit_code: number | null;
  duration_ms: number | null;
  log: { lines: string[]; total_lines: number };
}

export async function rerunFailed(
  deps: ChecksDeps,
  args: RerunFailedArgs
): Promise<RerunFailedResult> {
  if (!args.run_id || typeof args.run_id !== "string") {
    throw new Error("rerunFailed: run_id is required");
  }
  if (!args.fingerprint || typeof args.fingerprint !== "string") {
    throw new Error("rerunFailed: fingerprint is required");
  }

  const sourceMeta = deps.storage.readMeta(args.run_id);
  const { groups } = computeRunGroups(deps, args.run_id);
  const target = groups.find((g) => g.fingerprint === args.fingerprint);
  if (!target) {
    throw new Error(
      `No group with fingerprint ${args.fingerprint} found in run ${args.run_id}`
    );
  }

  const projectRoot = resolve(deps.config.root);
  let originalCmd: string;
  let cwd: string;
  let adapter: AdapterName;
  let originalTimeout: number;

  if (sourceMeta.kind === "multi-step") {
    if (!target.step) {
      throw new Error(
        "rerunFailed: multi-step group has no step tag; cannot determine source step"
      );
    }
    const checkCfg = deps.config.checks[sourceMeta.check];
    if (!checkCfg || !isMultiStep(checkCfg)) {
      throw new Error(
        `rerunFailed: source check '${sourceMeta.check}' is not multi-step in current config`
      );
    }
    const stepCfg = checkCfg.steps.find((s) => s.name === target.step);
    if (!stepCfg) {
      throw new Error(
        `rerunFailed: step '${target.step}' not found in current config for check '${sourceMeta.check}'`
      );
    }
    originalCmd = stepCfg.cmd;
    cwd = stepCfg.cwd ? resolve(projectRoot, stepCfg.cwd) : projectRoot;
    adapter = stepCfg.adapter;
    originalTimeout = stepCfg.timeout_ms;
  } else {
    const checkCfg = deps.config.checks[sourceMeta.check];
    if (!checkCfg || isMultiStep(checkCfg)) {
      throw new Error(
        `rerunFailed: source check '${sourceMeta.check}' is no longer single-cmd in current config`
      );
    }
    originalCmd = sourceMeta.cmd;
    cwd = sourceMeta.cwd;
    adapter = checkCfg.adapter;
    originalTimeout = sourceMeta.timeout_ms;
  }

  const parser = parsers[adapter];
  if (!parser.buildRerunCmd) {
    throw new Error(
      `Adapter '${adapter}' does not support rerun_failed. Use get_log_slice to read the original log instead.`
    );
  }

  const rerunCmd = parser.buildRerunCmd(originalCmd, {
    symbol: target.symbol,
    message: target.message,
    files: target.files,
    occurrences: target.occurrences
  });
  if (!rerunCmd) {
    throw new Error(
      `Adapter '${adapter}' could not build a rerun cmd for fingerprint ${args.fingerprint} (insufficient info: symbol=${target.symbol ?? "<none>"}, file=${target.files[0] ?? "<none>"})`
    );
  }

  const rerunCheckName = `rerun_${args.fingerprint.slice(0, 8)}`;
  const handle = deps.runner.start({
    name: rerunCheckName,
    cmd: rerunCmd,
    cwd,
    timeout_ms: args.timeout_ms ?? originalTimeout
  });
  const finalMeta = await handle.done;

  if (finalMeta.kind !== "single") {
    throw new Error("internal: rerun produced non-single meta");
  }

  const slice = deps.storage.readLogSlice({
    run_id: handle.run_id,
    stream: "stdout"
  });

  return {
    source_run_id: args.run_id,
    rerun_run_id: handle.run_id,
    rerun_cmd: rerunCmd,
    status: finalMeta.status,
    exit_code: finalMeta.exit_code,
    duration_ms: finalMeta.duration_ms,
    log: { lines: slice.lines, total_lines: slice.total_lines }
  };
}
