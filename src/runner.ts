import { execa } from "execa";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type {
  Storage,
  RunMeta,
  RunStatus,
  StepStatus,
  MultiStepRunMeta,
  SingleRunMeta
} from "./storage.js";
import { createRedactStream } from "./redact.js";

export interface RunnerStartArgs {
  name: string;
  cmd: string;
  cwd: string;
  timeout_ms: number;
  env?: Record<string, string>;
  on_failure_cmd?: string;
}

interface OnFailureOutcome {
  status: StepStatus;
  exit_code: number | null;
  duration_ms: number;
}

const ON_FAILURE_TIMEOUT_MS = 60_000;

async function runOnFailure(
  cmd: string,
  cwd: string,
  env: Record<string, string> | undefined,
  stdoutPath: string,
  stderrPath: string
): Promise<OnFailureOutcome> {
  const stdoutFile = createWriteStream(stdoutPath, { flags: "a" });
  const stderrFile = createWriteStream(stderrPath, { flags: "a" });
  const proc = execa(cmd, {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    timeout: ON_FAILURE_TIMEOUT_MS,
    reject: false,
    shell: true
  });

  const stdoutPipe = proc.stdout
    ? pipeline(proc.stdout, createRedactStream(), stdoutFile)
    : Promise.resolve();
  const stderrPipe = proc.stderr
    ? pipeline(proc.stderr, createRedactStream(), stderrFile)
    : Promise.resolve();

  const startedAt = Date.now();
  const result = await proc;
  await Promise.all([stdoutPipe, stderrPipe]);

  let status: StepStatus;
  if (result.timedOut) status = "timeout";
  else if (result.isTerminated) status = "killed";
  else if (result.exitCode === 0) status = "completed";
  else status = "failed";

  return {
    status,
    exit_code: result.exitCode ?? null,
    duration_ms: Date.now() - startedAt
  };
}

export interface RunnerHandle {
  run_id: string;
  done: Promise<RunMeta>;
}

export interface RunnerSequenceArgs {
  run_id: string;
  env?: Record<string, string>;
}

export interface RunnerSequenceHandle {
  run_id: string;
  done: Promise<MultiStepRunMeta>;
}

export class Runner {
  constructor(private readonly storage: Storage) {
    if (!storage) {
      throw new Error("Runner: storage is required");
    }
  }

  start(args: RunnerStartArgs): RunnerHandle {
    const { meta, paths } = this.storage.createRun({
      check: args.name,
      cmd: args.cmd,
      cwd: args.cwd,
      timeout_ms: args.timeout_ms
    });

    const stdoutFile = createWriteStream(paths.stdout, { flags: "a" });
    const stderrFile = createWriteStream(paths.stderr, { flags: "a" });

    const proc = execa(args.cmd, {
      cwd: args.cwd,
      env: { ...process.env, ...(args.env ?? {}) },
      timeout: args.timeout_ms,
      reject: false,
      shell: true
    });

    const stdoutPipe = proc.stdout
      ? pipeline(proc.stdout, createRedactStream(), stdoutFile).catch(() => {})
      : Promise.resolve();
    const stderrPipe = proc.stderr
      ? pipeline(proc.stderr, createRedactStream(), stderrFile).catch(() => {})
      : Promise.resolve();

    const startedAt = Date.now();
    const storage = this.storage;
    const runId = meta.run_id;

    const onFailureCmd = args.on_failure_cmd;
    const onFailureCwd = args.cwd;
    const onFailureEnv = args.env;
    const onFailurePaths = paths;

    const done: Promise<RunMeta> = (async () => {
      const result = await proc;
      await Promise.all([stdoutPipe, stderrPipe]);

      let status: RunStatus;
      if (result.timedOut) status = "timeout";
      else if (result.isTerminated) status = "killed";
      else if (result.exitCode === 0) status = "completed";
      else status = "failed";

      let updated: RunMeta;
      try {
        updated = storage.updateMeta(runId, {
          status,
          exit_code: result.exitCode ?? null,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt
        } as Partial<SingleRunMeta>);
      } catch {
        return { run_id: runId, status } as unknown as RunMeta;
      }

      if (status !== "completed" && onFailureCmd) {
        const outcome = await runOnFailure(
          onFailureCmd,
          onFailureCwd,
          onFailureEnv,
          onFailurePaths.onFailureStdout,
          onFailurePaths.onFailureStderr
        );
        return storage.updateMeta(runId, {
          on_failure_status: outcome.status,
          on_failure_exit_code: outcome.exit_code,
          on_failure_duration_ms: outcome.duration_ms
        } as Partial<SingleRunMeta>);
      }
      return updated;
    })();

    return { run_id: meta.run_id, done };
  }

  runSequence(args: RunnerSequenceArgs): RunnerSequenceHandle {
    const storage = this.storage;
    const runId = args.run_id;

    const done: Promise<MultiStepRunMeta> = (async () => {
      const meta = storage.readMeta(runId);
      if (meta.kind !== "multi-step") {
        throw new Error(
          `runSequence: run_id ${runId} is not a multi-step run (kind: ${meta.kind})`
        );
      }

      const overallStartedAt = Date.now();
      let aborted = false;
      let failedStepIndex: number | null = null;
      let failedStepName: string | null = null;
      let overallExitCode: number | null = 0;

      for (let i = 0; i < meta.steps.length; i++) {
        const step = meta.steps[i];

        if (aborted) {
          storage.updateStepMeta(runId, i, { status: "skipped" });
          continue;
        }

        storage.updateStepMeta(runId, i, {
          status: "running",
          started_at: new Date().toISOString()
        });

        const stepPaths = storage.pathsForStep(runId, i);
        const stdoutFile = createWriteStream(stepPaths.stdout, { flags: "a" });
        const stderrFile = createWriteStream(stepPaths.stderr, { flags: "a" });

        const proc = execa(step.cmd, {
          cwd: step.cwd,
          env: { ...process.env, ...(args.env ?? {}) },
          timeout: step.timeout_ms,
          reject: false,
          shell: true
        });

        const stdoutPipe = proc.stdout
          ? pipeline(proc.stdout, createRedactStream(), stdoutFile)
          : Promise.resolve();
        const stderrPipe = proc.stderr
          ? pipeline(proc.stderr, createRedactStream(), stderrFile)
          : Promise.resolve();

        const stepStartedAt = Date.now();
        const result = await proc;
        await Promise.all([stdoutPipe, stderrPipe]);

        let stepStatus: StepStatus;
        if (result.timedOut) stepStatus = "timeout";
        else if (result.isTerminated) stepStatus = "killed";
        else if (result.exitCode === 0) stepStatus = "completed";
        else stepStatus = "failed";

        storage.updateStepMeta(runId, i, {
          status: stepStatus,
          exit_code: result.exitCode ?? null,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - stepStartedAt
        });

        if (stepStatus !== "completed") {
          if (failedStepIndex === null) {
            failedStepIndex = i;
            failedStepName = step.name;
            overallExitCode = result.exitCode ?? null;
          }
          if (step.on_failure_cmd) {
            const outcome = await runOnFailure(
              step.on_failure_cmd,
              step.cwd,
              args.env,
              stepPaths.onFailureStdout,
              stepPaths.onFailureStderr
            );
            storage.updateStepMeta(runId, i, {
              on_failure_status: outcome.status,
              on_failure_exit_code: outcome.exit_code,
              on_failure_duration_ms: outcome.duration_ms
            });
          }
          if (meta.fail_fast) aborted = true;
        }
      }

      const overallStatus: RunStatus = failedStepIndex === null ? "completed" : "failed";
      const updated = storage.updateMeta(runId, {
        status: overallStatus,
        exit_code: overallExitCode,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - overallStartedAt,
        failed_step: failedStepName,
        failed_step_index: failedStepIndex
      } as Partial<MultiStepRunMeta>);

      if (updated.kind !== "multi-step") {
        throw new Error("internal: meta kind changed unexpectedly");
      }
      return updated;
    })();

    return { run_id: runId, done };
  }
}
