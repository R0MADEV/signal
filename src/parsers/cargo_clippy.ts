import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

// "error[E0308]: mismatched types" or "warning: unused variable"
const DIAG_RE = /^(error|warning)(?:\[([A-Z0-9]+)\])?: (.+)$/;
// "  --> src/main.rs:5:13"
const LOC_RE = /^\s+-->\s+(.+):(\d+):(\d+)$/;
// Skip meta-errors with no location
const SKIP_RE = /^error: aborting due to|^error: could not compile/;

export function parseCargoClipy(input: ParserInput): ParsedError[] {
  const combined =
    input.stdout.length === 0 ? input.stderr : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let i = 0;
  while (i < lines.length) {
    if (SKIP_RE.test(lines[i])) { i++; continue; }

    const diagMatch = DIAG_RE.exec(lines[i]);
    if (!diagMatch) { i++; continue; }

    const level = diagMatch[1];
    const code = diagMatch[2];
    const message = diagMatch[3].trim();
    i++;

    let file = "<unknown>";
    let line: number | null = null;
    let column: number | null = null;

    if (i < lines.length) {
      const locMatch = LOC_RE.exec(lines[i]);
      if (locMatch) {
        file = relativizePath(locMatch[1], input.projectRoot);
        line = parseInt(locMatch[2], 10);
        column = parseInt(locMatch[3], 10);
        i++;
      }
    }

    if (file === "<unknown>") continue;

    out.push({
      file,
      line,
      column,
      type: level === "error" ? "error" : "warning",
      message,
      ...(code ? { symbol: code } : {})
    });
  }

  return out;
}
