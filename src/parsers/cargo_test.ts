import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { parseCargoClipy } from "./cargo_clippy.js";

export function buildCargoTestRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  if (!group.symbol) return null;
  return `${originalCmd} ${group.symbol}`;
}

// "---- module::tests::test_name stdout ----"
const SECTION_RE = /^---- (.+?) stdout ----$/;
// OLD format (Rust < 1.65): "thread '...' panicked at 'message', src/file.rs:line:col"
const PANIC_SINGLE_RE = /^thread '.+?' panicked at '(.+)', (.+\.rs):(\d+):(\d+)$/;
// OLD multiline form ends with "', src/file.rs:line:col"
const PANIC_LOC_RE = /^(.+)', (.+\.rs):(\d+):(\d+)$/;
// NEW format (Rust >= 1.65): "thread '...' panicked at src/file.rs:line:col:" then message on next line
const PANIC_NEW_RE = /^thread '.+?'(?:\s+\(\S+\))?\s+panicked at (.+\.rs):(\d+):(\d+):$/;
// "failures:\n    module::tests::test_name" (unit tests) or "    integration_test_name" (no ::)
const FAILURES_LIST_RE = /^failures:\s*$/;
const FAILURE_ITEM_RE = /^\s{4}(\S+)\s*$/;

export function parseCargoTest(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  // `cargo test` fails at compile time before any test runs (very common in Rust/TDD).
  // The compiler emits the same diagnostic format as clippy, so reuse that parser.
  out.push(...parseCargoClipy(input).filter((e) => e.type === "error"));

  // Collect per-test details from stdout sections
  const details = new Map<string, { file: string; line: number; column: number; message: string }>();

  let i = 0;
  while (i < lines.length) {
    const sectionMatch = SECTION_RE.exec(lines[i]);
    if (!sectionMatch) { i++; continue; }

    const testName = sectionMatch[1];
    i++;

    let file = "";
    let line = 0;
    let column = 0;
    let message = "";
    const msgLines: string[] = [];

    while (i < lines.length && !SECTION_RE.test(lines[i]) && !FAILURES_LIST_RE.test(lines[i])) {
      // NEW format (Rust >= 1.65): location on the panic line, message on the next line(s)
      const newMatch = PANIC_NEW_RE.exec(lines[i]);
      if (newMatch) {
        file = newMatch[1];
        line = parseInt(newMatch[2], 10);
        column = parseInt(newMatch[3], 10);
        message = i + 1 < lines.length ? lines[i + 1].trim() : "";
        break;
      }
      // OLD single-line panic: panicked at 'msg', file:line:col
      const singleMatch = PANIC_SINGLE_RE.exec(lines[i]);
      if (singleMatch) {
        message = singleMatch[1];
        file = singleMatch[2];
        line = parseInt(singleMatch[3], 10);
        column = parseInt(singleMatch[4], 10);
        break;
      }
      // OLD multi-line panic: last line of message ends with "', file:line:col"
      if (lines[i].startsWith("thread '") && lines[i].includes("panicked at '")) {
        // collect until we find the loc line
        const start = lines[i].indexOf("panicked at '") + "panicked at '".length;
        msgLines.push(lines[i].slice(start));
        i++;
        while (i < lines.length) {
          const locMatch = PANIC_LOC_RE.exec(lines[i]);
          if (locMatch) {
            msgLines.push(locMatch[1]);
            message = msgLines.join("\n").trim();
            file = locMatch[2];
            line = parseInt(locMatch[3], 10);
            column = parseInt(locMatch[4], 10);
            break;
          }
          msgLines.push(lines[i]);
          i++;
        }
        break;
      }
      i++;
    }

    if (file) {
      details.set(testName, { file, line, column, message });
    }
  }

  // Collect the failures list (source of truth for which tests failed)
  const failedTests: string[] = [];
  let inFailuresList = false;
  for (const line of lines) {
    if (FAILURES_LIST_RE.test(line)) { inFailuresList = true; continue; }
    if (!inFailuresList) continue;

    const itemMatch = FAILURE_ITEM_RE.exec(line);
    if (itemMatch) {
      failedTests.push(itemMatch[1]);
    } else if (line.trim() === "") {
      // blank line after collecting names ends the list
      if (failedTests.length > 0) break;
    } else {
      // a non-blank, non-item line means this 'failures:' was the stdout-section
      // header (followed by '---- ... ----'), not the final name list — reset.
      inFailuresList = false;
    }
  }

  for (const testName of failedTests) {
    const d = details.get(testName);
    out.push({
      file: d?.file ?? "<unknown>",
      line: d?.line ?? null,
      column: d?.column ?? null,
      type: "error",
      message: d?.message || testName,
      symbol: testName,
      ...(d?.message ? { context: d.message } : {})
    });
  }

  return out;
}
