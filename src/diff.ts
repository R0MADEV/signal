import type { ChecksDeps } from "./checks.js";
import type { ErrorGroup } from "./grouper.js";
import { computeRunGroups } from "./summary.js";

export interface DiffRunsArgs {
  check?: string;
  prev_run_id?: string;
  next_run_id?: string;
  max_per_section?: number;
}

export interface DiffPersisting extends ErrorGroup {
  prev_count: number;
  next_count: number;
  delta: number;
}

export interface DiffRunsResult {
  prev_run_id: string;
  next_run_id: string;
  added: ErrorGroup[];
  removed: ErrorGroup[];
  persisting: DiffPersisting[];
  stats: {
    added_count: number;
    removed_count: number;
    persisting_count: number;
  };
}

const DEFAULT_MAX = 10;

export function diffRuns(deps: ChecksDeps, args: DiffRunsArgs): DiffRunsResult {
  const max = args.max_per_section ?? DEFAULT_MAX;
  if (!Number.isFinite(max) || max < 0) {
    throw new Error(`max_per_section must be a non-negative number, got ${max}`);
  }

  const { prevId, nextId } = resolveRunIds(deps, args);

  const prev = computeRunGroups(deps, prevId);
  const next = computeRunGroups(deps, nextId);

  const prevMap = new Map(prev.groups.map((g) => [g.fingerprint, g]));
  const nextMap = new Map(next.groups.map((g) => [g.fingerprint, g]));

  const added = next.groups.filter((g) => !prevMap.has(g.fingerprint));
  const removed = prev.groups.filter((g) => !nextMap.has(g.fingerprint));
  const persisting: DiffPersisting[] = next.groups
    .filter((g) => prevMap.has(g.fingerprint))
    .map((g) => {
      const prevGroup = prevMap.get(g.fingerprint);
      const prev_count = prevGroup ? prevGroup.count : 0;
      return {
        ...g,
        prev_count,
        next_count: g.count,
        delta: g.count - prev_count
      };
    });

  return {
    prev_run_id: prevId,
    next_run_id: nextId,
    added: added.slice(0, max),
    removed: removed.slice(0, max),
    persisting: persisting.slice(0, max),
    stats: {
      added_count: added.length,
      removed_count: removed.length,
      persisting_count: persisting.length
    }
  };
}

function resolveRunIds(
  deps: ChecksDeps,
  args: DiffRunsArgs
): { prevId: string; nextId: string } {
  if (args.prev_run_id && args.next_run_id) {
    return { prevId: args.prev_run_id, nextId: args.next_run_id };
  }
  if (!args.check) {
    throw new Error(
      "diffRuns: must provide either both prev_run_id and next_run_id, or a check name to auto-select"
    );
  }
  const runs = deps.storage.listRuns({ check: args.check });
  if (runs.length < 2) {
    throw new Error(
      `diffRuns: need at least 2 runs of check '${args.check}' to diff, found ${runs.length}`
    );
  }
  return {
    prevId: args.prev_run_id ?? runs[1].run_id,
    nextId: args.next_run_id ?? runs[0].run_id
  };
}
