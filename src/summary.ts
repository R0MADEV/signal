import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChecksDeps } from "./checks.js";
import type { RunMeta, RunStatus, MultiStepRunMeta, StepStatus, StepMeta } from "./storage.js";
import type { ErrorGroup } from "./grouper.js";
import { groupErrors } from "./grouper.js";
import { isMultiStep } from "./config.js";
import { parsers, type AdapterName, type ParsedError } from "./parsers/index.js";

export interface SummaryStep {
  name: string;
  status: StepStatus;
  exit_code: number | null;
  duration_ms: number | null;
}

export interface RunSummary {
  run_id: string;
  check: string;
  status: RunStatus;
  exit_code: number | null;
  duration_ms: number | null;
  error_count: number;
  group_count: number;
  summary: string;
  top_groups: ErrorGroup[];
  parse_error?: string;
  kind?: "single" | "multi-step";
  failed_step?: string | null;
  step_count?: number;
  steps?: SummaryStep[];
}

export interface SummarizeArgs {
  run_id: string;
  max_groups?: number;
  max_occurrences?: number;
  severity?: "error" | "warning";
  sort_by?: "count" | "last" | "first";
}

export interface RunGroups {
  meta: RunMeta;
  groups: ErrorGroup[];
  errors_count: number;
  parse_error?: string;
}

const DEFAULT_MAX_GROUPS = 5;
const DEFAULT_MAX_OCCURRENCES = 5;

export function computeRunGroups(deps: ChecksDeps, run_id: string): RunGroups {
  const meta = deps.storage.readMeta(run_id);
  if (meta.status === "running") {
    return { meta, groups: [], errors_count: 0 };
  }

  const projectRoot = resolve(deps.config.root);

  if (meta.kind === "multi-step") {
    return computeMultiStepGroups(deps, meta, projectRoot);
  }

  const checkCfg = deps.config.checks[meta.check];
  const adapter: AdapterName =
    checkCfg && !isMultiStep(checkCfg) ? checkCfg.adapter : "generic";
  const stripPrefix =
    checkCfg && !isMultiStep(checkCfg) ? checkCfg.strip_path_prefix : undefined;
  const paths = deps.storage.pathsFor(run_id);
  const stdout = readFileSync(paths.stdout, "utf8");
  const stderr = readFileSync(paths.stderr, "utf8");

  let errors: ParsedError[];
  let parse_error: string | undefined;
  try {
    errors = parsers[adapter].parse({ stdout, stderr, projectRoot });
  } catch (e) {
    parse_error = (e as Error).message;
    errors = [];
  }

  if (stripPrefix) {
    for (const e of errors) e.file = stripPathPrefix(e.file, stripPrefix);
  }

  return {
    meta,
    groups: groupErrors(errors),
    errors_count: errors.length,
    parse_error
  };
}

function stripPathPrefix(p: string, prefix: string): string {
  const normalized = prefix.endsWith("/") ? prefix : prefix + "/";
  if (p.startsWith(normalized)) return p.slice(normalized.length);
  if (p === prefix) return "";
  return p;
}

function computeMultiStepGroups(
  deps: ChecksDeps,
  meta: MultiStepRunMeta,
  projectRoot: string
): RunGroups {
  const checkCfg = deps.config.checks[meta.check];
  const stepAdapters: Record<string, AdapterName> = {};
  const stepStripPrefix: Record<string, string | undefined> = {};
  if (checkCfg && isMultiStep(checkCfg)) {
    for (const s of checkCfg.steps) {
      stepAdapters[s.name] = s.adapter;
      stepStripPrefix[s.name] = s.strip_path_prefix;
    }
  }

  const allErrors: ParsedError[] = [];
  let parse_error: string | undefined;
  const stepGroupTags: Map<string, string> = new Map();

  for (let i = 0; i < meta.steps.length; i++) {
    const step = meta.steps[i];
    if (step.status === "pending" || step.status === "skipped") continue;
    if (step.status === "running") continue;

    const adapter: AdapterName = stepAdapters[step.name] ?? "generic";
    const stripPrefix = stepStripPrefix[step.name];
    const stepPaths = deps.storage.pathsForStep(meta.run_id, i);
    const stdout = readFileSync(stepPaths.stdout, "utf8");
    const stderr = readFileSync(stepPaths.stderr, "utf8");

    let stepErrors: ParsedError[] = [];
    try {
      stepErrors = parsers[adapter].parse({ stdout, stderr, projectRoot });
    } catch (e) {
      const msg = `step '${step.name}' (${adapter}): ${(e as Error).message}`;
      parse_error = parse_error ? `${parse_error}; ${msg}` : msg;
      continue;
    }

    if (stripPrefix) {
      for (const e of stepErrors) e.file = stripPathPrefix(e.file, stripPrefix);
    }

    for (const e of stepErrors) {
      allErrors.push(e);
      const tagKey = `${e.file}:${e.line}:${e.column}:${e.message}`;
      stepGroupTags.set(tagKey, step.name);
    }
  }

  const rawGroups = groupErrors(allErrors);
  const groups: ErrorGroup[] = rawGroups.map((g) => {
    const sample = g.occurrences[0];
    const tagKey = `${sample.file}:${sample.line}:${sample.column}:${g.message}`;
    const stepName = stepGroupTags.get(tagKey);
    return stepName ? { ...g, step: stepName } : g;
  });

  return {
    meta,
    groups,
    errors_count: allErrors.length,
    parse_error
  };
}

export function summarizeRun(deps: ChecksDeps, args: SummarizeArgs): RunSummary {
  const maxGroups = args.max_groups ?? DEFAULT_MAX_GROUPS;
  const maxOccurrences = args.max_occurrences ?? DEFAULT_MAX_OCCURRENCES;
  if (!Number.isFinite(maxGroups) || maxGroups <= 0) {
    throw new Error(`max_groups must be a positive number, got ${maxGroups}`);
  }
  if (!Number.isFinite(maxOccurrences) || maxOccurrences <= 0) {
    throw new Error(`max_occurrences must be a positive number, got ${maxOccurrences}`);
  }

  const { meta, groups: rawGroups, errors_count, parse_error } = computeRunGroups(deps, args.run_id);
  const filtered = args.severity ? rawGroups.filter(g => g.type === args.severity) : rawGroups;
  const groups = sortGroups(filtered, args.sort_by);

  if (meta.status === "running") {
    return {
      run_id: args.run_id,
      check: meta.check,
      status: meta.status,
      exit_code: meta.exit_code,
      duration_ms: meta.duration_ms,
      error_count: 0,
      group_count: 0,
      summary: `${meta.check} is still running`,
      top_groups: []
    };
  }

  const top_groups = groups.slice(0, maxGroups).map((g) => ({
    ...g,
    occurrences: g.occurrences.slice(0, maxOccurrences)
  }));

  const base: RunSummary = {
    run_id: args.run_id,
    check: meta.check,
    status: meta.status,
    exit_code: meta.exit_code,
    duration_ms: meta.duration_ms,
    error_count: errors_count,
    group_count: groups.length,
    summary: buildSummaryLine(meta, errors_count, groups.length),
    top_groups
  };
  if (parse_error) base.parse_error = parse_error;

  if (meta.kind === "multi-step") {
    base.kind = "multi-step";
    base.failed_step = meta.failed_step;
    base.step_count = meta.steps.length;
    base.steps = meta.steps.map((s) => stepSummary(s));
  }

  return base;
}

function stepSummary(s: StepMeta): SummaryStep {
  return {
    name: s.name,
    status: s.status,
    exit_code: s.exit_code,
    duration_ms: s.duration_ms
  };
}

function sortGroups(groups: ErrorGroup[], sortBy?: "count" | "last" | "first"): ErrorGroup[] {
  if (!sortBy || sortBy === "count") return groups;
  if (sortBy === "last") return [...groups].sort((a, b) => b.last_position - a.last_position);
  return [...groups].sort((a, b) => a.first_position - b.first_position);
}

function buildSummaryLine(meta: RunMeta, errorCount: number, groupCount: number): string {
  if (meta.kind === "multi-step") {
    if (meta.status === "completed") {
      return `${meta.check} passed (${meta.steps.length} steps) in ${meta.duration_ms ?? 0}ms`;
    }
    if (meta.failed_step_index !== null && meta.failed_step !== null) {
      const stepNum = meta.failed_step_index + 1;
      return `${meta.check} failed at step ${stepNum}/${meta.steps.length} (${meta.failed_step}) with exit ${meta.exit_code ?? "?"}`;
    }
    return `${meta.check} ${meta.status}`;
  }

  if (errorCount === 0) {
    return meta.status === "completed"
      ? `${meta.check} passed in ${meta.duration_ms ?? 0}ms`
      : `${meta.check} ${meta.status} (exit ${meta.exit_code ?? "?"}) — no parsed errors`;
  }
  const errLabel = errorCount === 1 ? "error" : "errors";
  const grpLabel = groupCount === 1 ? "category" : "categories";
  return `${meta.check} ${meta.status} with ${errorCount} ${errLabel} grouped into ${groupCount} ${grpLabel}`;
}
