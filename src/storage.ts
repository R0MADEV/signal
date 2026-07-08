import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type RunStatus = "running" | "completed" | "failed" | "timeout" | "killed";
export type StepStatus = RunStatus | "pending" | "skipped";

export interface StepMeta {
  index: number;
  name: string;
  cmd: string;
  cwd: string;
  status: StepStatus;
  exit_code: number | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  timeout_ms: number;
  on_failure_cmd: string | null;
  on_failure_status: StepStatus | null;
  on_failure_exit_code: number | null;
  on_failure_duration_ms: number | null;
}

export interface SingleRunMeta {
  kind: "single";
  run_id: string;
  check: string;
  cmd: string;
  cwd: string;
  status: RunStatus;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  timeout_ms: number;
  on_failure_cmd: string | null;
  on_failure_status: StepStatus | null;
  on_failure_exit_code: number | null;
  on_failure_duration_ms: number | null;
}

export interface MultiStepRunMeta {
  kind: "multi-step";
  run_id: string;
  check: string;
  cwd: string;
  status: RunStatus;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  fail_fast: boolean;
  failed_step: string | null;
  failed_step_index: number | null;
  steps: StepMeta[];
}

export type RunMeta = SingleRunMeta | MultiStepRunMeta;

export interface RunPaths {
  dir: string;
  stdout: string;
  stderr: string;
  meta: string;
  groups: string;
  onFailureStdout: string;
  onFailureStderr: string;
}

export interface StepPaths {
  dir: string;
  stdout: string;
  stderr: string;
  meta: string;
  onFailureStdout: string;
  onFailureStderr: string;
}

export interface StepInput {
  name: string;
  cmd: string;
  cwd?: string;
  timeout_ms: number;
  on_failure?: string;
}

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

function assertSafeName(label: string, value: string): void {
  if (typeof value !== "string" || value.length === 0 || !SAFE_NAME.test(value)) {
    throw new Error(
      `Invalid ${label}: must match /^[a-zA-Z0-9_-]+$/, got ${JSON.stringify(value)}`
    );
  }
}

function assertNonEmpty(label: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPositive(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number, got ${value}`);
  }
}

export class Storage {
  constructor(private readonly root: string) {
    assertNonEmpty("Storage root", root);
  }

  private get runsDir(): string {
    return resolve(this.root, ".signal", "runs");
  }

  pathsFor(run_id: string): RunPaths {
    assertSafeName("run_id", run_id);
    const dir = join(this.runsDir, run_id);
    return {
      dir,
      stdout: join(dir, "stdout.log"),
      stderr: join(dir, "stderr.log"),
      meta: join(dir, "meta.json"),
      groups: join(dir, "groups.json"),
      onFailureStdout: join(dir, "on_failure.stdout.log"),
      onFailureStderr: join(dir, "on_failure.stderr.log")
    };
  }

  pathsForStep(run_id: string, step_index: number): StepPaths {
    const meta = this.readMeta(run_id);
    if (meta.kind !== "multi-step") {
      throw new Error(`Run ${run_id} is not multi-step (kind: ${meta.kind})`);
    }
    if (!Number.isInteger(step_index) || step_index < 0 || step_index >= meta.steps.length) {
      throw new Error(
        `step_index ${step_index} out of range for run ${run_id} (steps: ${meta.steps.length})`
      );
    }
    const step = meta.steps[step_index];
    const dir = join(this.runsDir, run_id, "steps", `${step_index + 1}-${step.name}`);
    return {
      dir,
      stdout: join(dir, "stdout.log"),
      stderr: join(dir, "stderr.log"),
      meta: join(dir, "meta.json"),
      onFailureStdout: join(dir, "on_failure.stdout.log"),
      onFailureStderr: join(dir, "on_failure.stderr.log")
    };
  }

  createRun(args: {
    check: string;
    cmd: string;
    cwd: string;
    timeout_ms: number;
    on_failure?: string;
  }): { meta: SingleRunMeta; paths: RunPaths } {
    assertSafeName("check name", args.check);
    assertNonEmpty("cmd", args.cmd);
    assertNonEmpty("cwd", args.cwd);
    assertPositive("timeout_ms", args.timeout_ms);

    const run_id = `${args.check}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const paths = this.pathsFor(run_id);
    mkdirSync(paths.dir, { recursive: true });

    const meta: SingleRunMeta = {
      kind: "single",
      run_id,
      check: args.check,
      cmd: args.cmd,
      cwd: args.cwd,
      status: "running",
      exit_code: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_ms: null,
      timeout_ms: args.timeout_ms,
      on_failure_cmd: args.on_failure ?? null,
      on_failure_status: null,
      on_failure_exit_code: null,
      on_failure_duration_ms: null
    };
    writeFileSync(paths.meta, JSON.stringify(meta, null, 2));
    writeFileSync(paths.stdout, "");
    writeFileSync(paths.stderr, "");
    return { meta, paths };
  }

  createMultiStepRun(args: {
    check: string;
    steps: StepInput[];
    cwd: string;
    fail_fast: boolean;
  }): { meta: MultiStepRunMeta; paths: RunPaths } {
    assertSafeName("check name", args.check);
    assertNonEmpty("cwd", args.cwd);
    if (!Array.isArray(args.steps) || args.steps.length === 0) {
      throw new Error("createMultiStepRun: steps must be a non-empty array");
    }
    for (const s of args.steps) {
      assertSafeName("step name", s.name);
      assertNonEmpty(`step '${s.name}' cmd`, s.cmd);
      assertPositive(`step '${s.name}' timeout_ms`, s.timeout_ms);
    }

    const run_id = `${args.check}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const paths = this.pathsFor(run_id);
    mkdirSync(paths.dir, { recursive: true });

    const stepMetas: StepMeta[] = args.steps.map((s, i) => ({
      index: i,
      name: s.name,
      cmd: s.cmd,
      cwd: s.cwd ?? args.cwd,
      status: "pending",
      exit_code: null,
      started_at: null,
      finished_at: null,
      duration_ms: null,
      timeout_ms: s.timeout_ms,
      on_failure_cmd: s.on_failure ?? null,
      on_failure_status: null,
      on_failure_exit_code: null,
      on_failure_duration_ms: null
    }));

    const meta: MultiStepRunMeta = {
      kind: "multi-step",
      run_id,
      check: args.check,
      cwd: args.cwd,
      status: "running",
      exit_code: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_ms: null,
      fail_fast: args.fail_fast,
      failed_step: null,
      failed_step_index: null,
      steps: stepMetas
    };

    writeFileSync(paths.meta, JSON.stringify(meta, null, 2));
    writeFileSync(paths.stdout, "");
    writeFileSync(paths.stderr, "");

    for (let i = 0; i < args.steps.length; i++) {
      const step = args.steps[i];
      const stepDir = join(paths.dir, "steps", `${i + 1}-${step.name}`);
      mkdirSync(stepDir, { recursive: true });
      writeFileSync(join(stepDir, "stdout.log"), "");
      writeFileSync(join(stepDir, "stderr.log"), "");
      writeFileSync(join(stepDir, "meta.json"), JSON.stringify(stepMetas[i], null, 2));
    }

    return { meta, paths };
  }

  readMeta(run_id: string): RunMeta {
    const paths = this.pathsFor(run_id);
    if (!existsSync(paths.meta)) {
      throw new Error(`Unknown run_id: ${run_id}`);
    }
    const raw = JSON.parse(readFileSync(paths.meta, "utf8"));
    if (raw.kind === "multi-step") {
      return raw as MultiStepRunMeta;
    }
    if (raw.kind === "single") {
      return raw as SingleRunMeta;
    }
    return { kind: "single", ...raw } as SingleRunMeta;
  }

  updateMeta(run_id: string, patch: Partial<SingleRunMeta> | Partial<MultiStepRunMeta>): RunMeta {
    const current = this.readMeta(run_id);
    const next = { ...current, ...patch } as RunMeta;
    writeFileSync(this.pathsFor(run_id).meta, JSON.stringify(next, null, 2));
    return next;
  }

  updateStepMeta(run_id: string, step_index: number, patch: Partial<StepMeta>): StepMeta {
    const meta = this.readMeta(run_id);
    if (meta.kind !== "multi-step") {
      throw new Error(`Run ${run_id} is not multi-step`);
    }
    if (!Number.isInteger(step_index) || step_index < 0 || step_index >= meta.steps.length) {
      throw new Error(
        `step_index ${step_index} out of range (steps: ${meta.steps.length})`
      );
    }
    const updatedStep: StepMeta = { ...meta.steps[step_index], ...patch };
    const stepPaths = this.pathsForStep(run_id, step_index);
    writeFileSync(stepPaths.meta, JSON.stringify(updatedStep, null, 2));

    const updatedSteps = meta.steps.slice();
    updatedSteps[step_index] = updatedStep;
    const updatedGlobal: MultiStepRunMeta = { ...meta, steps: updatedSteps };
    writeFileSync(this.pathsFor(run_id).meta, JSON.stringify(updatedGlobal, null, 2));

    return updatedStep;
  }

  deleteRun(run_id: string): void {
    assertSafeName("run_id", run_id);
    const dir = join(this.runsDir, run_id);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  listRuns(filter?: { check?: string }): RunMeta[] {
    let entries: string[];
    try {
      entries = readdirSync(this.runsDir);
    } catch {
      return [];
    }
    const metas: RunMeta[] = [];
    for (const entry of entries) {
      if (!SAFE_NAME.test(entry)) continue;
      try {
        const meta = this.readMeta(entry);
        if (filter?.check && meta.check !== filter.check) continue;
        metas.push(meta);
      } catch {
        continue;
      }
    }
    metas.sort((a, b) => b.started_at.localeCompare(a.started_at));
    return metas;
  }

  readLogSlice(args: {
    run_id: string;
    stream: "stdout" | "stderr";
    from_line?: number;
    to_line?: number;
    step_index?: number;
    from?: "main" | "on_failure";
  }): { lines: string[]; total_lines: number; from_line: number; to_line: number } {
    const runPaths = this.pathsFor(args.run_id);
    if (!existsSync(runPaths.meta)) {
      throw new Error(`Unknown run_id: ${args.run_id}`);
    }
    const source = args.from ?? "main";
    let file: string;
    if (args.step_index !== undefined) {
      const stepPaths = this.pathsForStep(args.run_id, args.step_index);
      if (source === "on_failure") {
        file = args.stream === "stdout" ? stepPaths.onFailureStdout : stepPaths.onFailureStderr;
      } else {
        file = args.stream === "stdout" ? stepPaths.stdout : stepPaths.stderr;
      }
    } else if (source === "on_failure") {
      file = args.stream === "stdout" ? runPaths.onFailureStdout : runPaths.onFailureStderr;
    } else {
      file = args.stream === "stdout" ? runPaths.stdout : runPaths.stderr;
    }
    const content = existsSync(file) ? readFileSync(file, "utf8") : "";
    const stripped = content.endsWith("\n") ? content.slice(0, -1) : content;
    const all = stripped.length === 0 ? [] : stripped.split("\n");
    const total = all.length;
    const from = Math.max(1, args.from_line ?? 1);
    const to = Math.min(total, args.to_line ?? total);
    const lines = from > to ? [] : all.slice(from - 1, to);
    return { lines, total_lines: total, from_line: from, to_line: to };
  }
}
