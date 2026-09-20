import type { RunStatus, Storage } from "./storage.js";

// A finished run that succeeded adds nothing the returned summary does not
// already carry, so it is discarded to keep .signal/ small. A failure is kept:
// the agent still needs get_log_slice, diff_runs and rerun_failed to drill in,
// and deleting it makes the summary point at a run_id that no longer exists.
export function shouldDiscardRun(run: { status: RunStatus; exit_code: number | null }): boolean {
  const isFinished = run.status !== "running";
  return isFinished && run.exit_code === 0;
}

export interface RetentionPolicy {
  max_runs_per_check?: number;
  max_age_days?: number;
}

export interface RetentionResult {
  removed: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  max_runs_per_check: 20
};

export function applyRetention(
  storage: Storage,
  policy: RetentionPolicy | undefined
): RetentionResult {
  if (!policy) return { removed: 0 };
  const hasMax = typeof policy.max_runs_per_check === "number" && policy.max_runs_per_check > 0;
  const hasAge = typeof policy.max_age_days === "number" && policy.max_age_days > 0;
  if (!hasMax && !hasAge) {
    return { removed: 0 };
  }

  const runs = storage.listRuns();
  const toRemove = new Set<string>();

  if (hasMax) {
    const counts = new Map<string, number>();
    for (const r of runs) {
      const c = counts.get(r.check) ?? 0;
      if (c >= (policy.max_runs_per_check as number)) {
        toRemove.add(r.run_id);
      }
      counts.set(r.check, c + 1);
    }
  }

  if (hasAge) {
    const cutoff = Date.now() - (policy.max_age_days as number) * 24 * 60 * 60 * 1000;
    for (const r of runs) {
      const ts = new Date(r.started_at).getTime();
      if (Number.isFinite(ts) && ts < cutoff) {
        toRemove.add(r.run_id);
      }
    }
  }

  for (const id of toRemove) {
    storage.deleteRun(id);
  }

  return { removed: toRemove.size };
}
