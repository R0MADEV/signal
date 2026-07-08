import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startCheck, getRunStatus, listRuns, runCheck, type ChecksDeps } from "./checks.js";
import { isMultiStep } from "./config.js";
import { summarizeRun } from "./summary.js";
import { diffRuns } from "./diff.js";
import { rerunFailed } from "./rerun.js";

export function createServer(deps: ChecksDeps): McpServer {
  const server = new McpServer({
    name: "signal-mcp",
    version: "0.1.0"
  });

  server.tool(
    "list_checks",
    "List configured checks for the current project.",
    {},
    async () =>
      textJson({
        checks: Object.entries(deps.config.checks).map(([name, c]) =>
          isMultiStep(c)
            ? {
                name,
                kind: "multi-step" as const,
                fail_fast: c.fail_fast,
                step_count: c.steps.length,
                steps: c.steps.map((s) => ({
                  name: s.name,
                  cmd: s.cmd,
                  adapter: s.adapter,
                  timeout_ms: s.timeout_ms
                }))
              }
            : {
                name,
                kind: "single" as const,
                cmd: c.cmd,
                adapter: c.adapter,
                timeout_ms: c.timeout_ms
              }
        )
      })
  );

  server.tool(
    "start_check",
    "Start a configured check asynchronously. Returns run_id immediately; poll with get_run_status.",
    { name: z.string().min(1) },
    async ({ name }) => {
      const result = startCheck(deps, { name });
      result.done.catch((err) => {
        console.error(`[signal-mcp] run ${result.run_id} rejected:`, err);
      });
      return textJson({ run_id: result.run_id, status: result.status });
    }
  );

  server.tool(
    "run_check",
    "Run a check and wait for it to complete, then return the compact summary directly. No polling needed. If max_wait_ms is set and the check exceeds it, returns status=running with run_id so the agent can poll.",
    {
      name: z.string().min(1),
      max_groups: z.number().int().positive().optional(),
      max_occurrences: z.number().int().positive().optional(),
      max_wait_ms: z.number().int().positive().optional(),
      severity: z.enum(["error", "warning"]).optional()
    },
    async ({ name, max_groups, max_occurrences, max_wait_ms, severity }) => {
      const summary = await runCheck(deps, { name, max_groups, max_occurrences, max_wait_ms });
      if (summary.status !== "running") {
        deps.storage.deleteRun(summary.run_id);
      }
      return textJson(summary);
    }
  );

  server.tool(
    "get_run_status",
    "Get the metadata of a run by run_id (status, exit_code, timing, cmd).",
    { run_id: z.string().min(1) },
    async ({ run_id }) => textJson(getRunStatus(deps, { run_id }))
  );

  server.tool(
    "list_runs",
    "List recent runs sorted by start time descending. Optional filter by check name.",
    { check: z.string().min(1).optional() },
    async ({ check }) => textJson({ runs: listRuns(deps, { check }) })
  );

  server.tool(
    "get_run_summary",
    "Compact diagnostic for a finished run: parsed errors, grouped by fingerprint, sorted by impact, with file/line occurrences truncated.",
    {
      run_id: z.string().min(1),
      max_groups: z.number().int().positive().optional(),
      max_occurrences: z.number().int().positive().optional(),
      severity: z.enum(["error", "warning"]).optional()
    },
    async ({ run_id, max_groups, max_occurrences, severity }) => {
      const summary = summarizeRun(deps, { run_id, max_groups, max_occurrences, severity });
      if (summary.status !== "running") {
        deps.storage.deleteRun(run_id);
      }
      return textJson(summary);
    }
  );

  server.tool(
    "diff_runs",
    "Compare two runs by error fingerprint. Returns added (new errors), removed (fixed errors), and persisting (unchanged, with delta). If only check is given, diffs the two latest runs of that check.",
    {
      check: z.string().min(1).optional(),
      prev_run_id: z.string().min(1).optional(),
      next_run_id: z.string().min(1).optional(),
      max_per_section: z.number().int().nonnegative().optional()
    },
    async ({ check, prev_run_id, next_run_id, max_per_section }) =>
      textJson(diffRuns(deps, { check, prev_run_id, next_run_id, max_per_section }))
  );

  server.tool(
    "get_log_slice",
    "Read a 1-indexed line range from a run's stdout or stderr log. For multi-step runs, pass step_index to read a specific step's log (0-based). Pass from='on_failure' to read the post-failure context capture (when the check/step had an on_failure cmd configured).",
    {
      run_id: z.string().min(1),
      stream: z.enum(["stdout", "stderr"]),
      from_line: z.number().int().positive().optional(),
      to_line: z.number().int().positive().optional(),
      step_index: z.number().int().nonnegative().optional(),
      from: z.enum(["main", "on_failure"]).optional()
    },
    async ({ run_id, stream, from_line, to_line, step_index, from }) =>
      textJson(
        deps.storage.readLogSlice({ run_id, stream, from_line, to_line, step_index, from })
      )
  );

  server.tool(
    "rerun_failed",
    "Re-execute only the failing test/scenario from a previous run, with the adapter's verbose drill flags (e.g. behat <file>:<line> -vv, phpunit --filter, vitest -t). Returns the full log of the targeted re-run so the agent can see the detailed assertion message. Pass the fingerprint of the group from get_run_summary's top_groups.",
    {
      run_id: z.string().min(1),
      fingerprint: z.string().min(1),
      timeout_ms: z.number().int().positive().optional()
    },
    async ({ run_id, fingerprint, timeout_ms }) =>
      textJson(await rerunFailed(deps, { run_id, fingerprint, timeout_ms }))
  );

  return server;
}

function textJson(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}
