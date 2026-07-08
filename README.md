# Signal MCP

An MCP server that sits between an AI agent and your project's developer tooling — tests, linters, type checkers, builds — and compresses noisy output into compact, actionable diagnostics.

When an AI agent runs a test suite or linter directly, it receives hundreds or thousands of lines of raw output that flood the context window. Signal solves this by running the command, storing the full log on disk, parsing errors with a language-aware adapter, grouping duplicates by normalized fingerprint, and returning only a structured summary. The model sees one line per error group instead of the full log.

```
huge logs → grouped errors → compact diagnostic → fewer tokens
```

## How it works

```
Agent → run_check("backend_test")
      → Signal runs the command
      → stores full log on disk
      → parses errors with the configured adapter (auto-detected if not set)
      → groups duplicates by fingerprint
      → returns: N failing tests, M groups + raw_tail if nothing parsed
      → Agent fixes code
      → run_check again
      → diff_runs → "2 fixed, 1 persisting"
      → done
```

The model never sees the full log unless it explicitly requests a slice with `get_log_slice`.

## Setup

```bash
npm install
npm run build
```

Create a `signal.config.json` in your project root (see `signal.config.example.json` for reference):

```json
{
  "projects": {
    "my-project": {
      "root": "/path/to/my-project",
      "checks": {
        "test": {
          "cmd": "npx vitest run"
        },
        "lint": {
          "cmd": "pnpm exec biome check src --reporter json 2>&1"
        }
      }
    }
  }
}
```

The `adapter` field is optional — Signal auto-detects the right adapter from the command (vitest, pytest, cargo test, eslint, etc.). Set it explicitly only when auto-detection would be wrong.

### Register as MCP server

```bash
node dist/index.js install --config /path/to/signal.config.json
```

Or add it manually to your `~/.claude.json`:

```json
{
  "mcpServers": {
    "signal": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/signal-mcp/dist/index.js"],
      "env": {
        "SIGNAL_CONFIG": "/path/to/signal.config.json"
      }
    }
  }
}
```

Signal auto-detects the active project from the working directory — it matches any subdirectory of a configured project root.

## MCP tools

| Tool | Description |
|---|---|
| `list_checks` | List all configured checks for the current project |
| `run_check` | Run a check and return the compact summary directly — no polling needed |
| `run_checks` | Run multiple checks **in parallel** and return all summaries at once |
| `start_check` | Start a check asynchronously. Returns `run_id` immediately |
| `get_run_status` | Get the status of a running or finished check |
| `get_run_summary` | Compact diagnostic: error groups with file/line occurrences |
| `diff_runs` | Compare two runs by fingerprint — shows what was fixed, what's new, what persists |
| `get_log_slice` | Read any line range from the raw log when more context is needed |
| `list_runs` | List recent runs, optionally filtered by check name |
| `rerun_failed` | Re-run a single failing test with verbose flags using the group fingerprint |

### Typical agent workflow

```
1. list_checks                               → discover available checks
2. run_check { name: "test" }                → summary returned directly
3. (fix the errors)
4. run_check { name: "test" }                → run again after the fix
5. diff_runs { check: "test" }               → verify what changed
6. get_log_slice { run_id, stream }          → zoom into raw log if needed
```

Run frontend and backend checks simultaneously:

```
run_checks { names: ["frontend_test", "backend_test"] }   → both run in parallel, one summary per check
```

For long-running checks (E2E, integration):

```
1. start_check { name: "e2e" }          → run_id returned immediately
2. get_run_status { run_id }            → poll until status != "running"
3. get_run_summary { run_id }           → read the compact diagnostic
```

## Summary options

`get_run_summary` and `run_check` accept these optional parameters:

| Option | Description |
|---|---|
| `max_groups` | Max error groups to return (default 5) |
| `max_occurrences` | Max occurrences per group (default 5) |
| `severity` | Filter by `"error"` or `"warning"` |
| `sort_by` | `"count"` (default — most frequent first), `"last"` (latest in log first, useful for cascading errors where the root cause appears last), `"first"` (earliest first) |

`run_check` also accepts:

| Option | Description |
|---|---|
| `max_wait_ms` | If the check exceeds this duration, return `status: "running"` with `run_id` instead of waiting |

### raw_tail fallback

When a check fails but the adapter parses zero errors (unrecognized output format), the summary automatically includes a `raw_tail` field with the last 30 lines of output — so the agent always has something actionable without needing `get_log_slice`.

## Multi-step pipelines

For checks where order matters (clean → prepare → test):

```json
{
  "checks": {
    "full": {
      "steps": [
        { "name": "clean",   "cmd": "rm -rf var/cache/*",  "timeout_ms": 30000 },
        { "name": "prepare", "cmd": "bin/prepare-test-db", "timeout_ms": 120000 },
        { "name": "test",    "cmd": "vendor/bin/behat",    "timeout_ms": 300000 }
      ],
      "fail_fast": true
    }
  }
}
```

Each step gets its own adapter (auto-detected from `cmd`). `get_run_summary` returns which step failed and grouped errors from that step.

## Adapters

Signal auto-detects the adapter from the command — no need to set `adapter` explicitly for common tools.

| Adapter | Works with | Auto-detected from |
|---|---|---|
| `vitest` | Vitest | `vitest` in cmd |
| `jest` | Jest | `jest` in cmd |
| `pytest` | pytest — parses `FAILED` lines and traceback blocks | `pytest` in cmd |
| `mocha` | Mocha `N failing` section | `mocha` in cmd |
| `phpunit` | PHPUnit failure/error sections | `phpunit` in cmd |
| `phpstan` | PHPStan `--error-format=json` | `phpstan --error-format=json` |
| `behat` | Behat "Failed scenarios:" block | `behat` in cmd |
| `pest` | Pest PHP `⨯ test name` format | `pest` in cmd |
| `phpspec` | PHPSpec failure blocks with spec class and line | `phpspec` in cmd |
| `rspec` | RSpec `Failures:` section with `# file:line` | `rspec` in cmd |
| `eslint` | ESLint stylish multiline output | `eslint` in cmd |
| `biome` | Biome `--reporter json` output | `biome --reporter json` |
| `rubocop` | RuboCop `file:line:col: SEVERITY: Rule: msg` | `rubocop` in cmd |
| `bun_test` | Bun test runner `✗ test name` format | `bun test` in cmd |
| `go_test` | Go `--- FAIL: TestName` from `go test ./...` | `go test` in cmd |
| `cargo_test` | Rust `cargo test` — panic sections with file/line | `cargo test` in cmd |
| `cargo_clippy` | Rust `cargo clippy` — `error[CODE]:` + `-->` location | `cargo clippy` in cmd |
| `playwright` | Playwright numbered failure blocks with browser tag | `playwright` in cmd |
| `cypress` | Cypress `(Running: ...)` blocks with numbered failures | `cypress` in cmd |
| `json_log` | Structured JSON logs `{"level":"error","message":"..."}` | — |
| `junit` | JUnit XML reports | — |
| `generic` | Any tool emitting `file:line:col message` — tsc, mypy, ruff, pyright, gcc, golangci-lint, and more | fallback |

Adding an adapter is ~30–50 lines + tests. The interface is:

```ts
parse({ stdout, stderr, projectRoot }): ParsedError[]
```

## Fingerprint algorithm

Errors are grouped by a 12-character SHA1 fingerprint:

- If a `symbol` was extracted (test name, function name): `type:sym:<symbol>`
- Otherwise: `type:msg:<normalized_message>` — quoted strings → `<str>`, paths → `<path>`, numbers → `N`

Errors that differ only in line numbers, paths, or quoted values collapse into one group. `diff_runs` compares fingerprints between runs to identify fixed vs. new vs. persisting errors.

## Storage layout

```
.signal/runs/<check>_<timestamp>_<random>/
├── stdout.log
├── stderr.log
├── meta.json
└── steps/                    # only for multi-step runs
    ├── 1-clean/
    ├── 2-prepare/
    └── 3-test/
```

`run_id` is validated against `^[a-zA-Z0-9_-]+$` — path traversal is rejected before any disk I/O.

Runs are cleaned up automatically after each execution: the last 20 runs per check are kept, older ones are deleted.

## Configuration reference

### Per-check fields (single command)

| Field | Type | Default | Description |
|---|---|---|---|
| `cmd` | string | required | Shell command to run |
| `adapter` | string | auto-detected | Parser adapter name — omit to auto-detect from `cmd` |
| `timeout_ms` | number | `60000` | Max execution time |
| `cwd` | string | project root | Working directory |
| `env` | object | — | Extra environment variables |
| `strip_path_prefix` | string | — | Strip this prefix from file paths in errors (useful for Docker paths) |
| `on_failure` | string | — | Command to run after a failure to capture extra context |

### Per-check fields (multi-step)

| Field | Type | Default | Description |
|---|---|---|---|
| `steps` | array | required | Ordered list of steps, each with per-step fields above |
| `fail_fast` | boolean | `true` | Stop pipeline on first failing step |

## Development

```bash
npm test          # run all tests (vitest)
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
```

Tests are colocated under `tests/`. Each adapter has its own `.test.ts` file.

## License

MIT
