import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const FAILURES_RE = /^Failures:\s*$/;
const ENTRY_RE = /^\s+\d+\)\s+(.+)$/;
const FAILURE_RE = /^\s+Failure\/Error:\s+(.+)$/;
const MSG_RE = /^\s{7,}(.+)$/;
const LOC_RE = /^\s+#\s+(.+\.rb):(\d+):/;
const TERMINATOR_RE = /^\d+ examples?/;

export function parseRspec(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let i = 0;
  while (i < lines.length && !FAILURES_RE.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;

  while (i < lines.length && !TERMINATOR_RE.test(lines[i])) {
    const entryMatch = ENTRY_RE.exec(lines[i]);
    if (!entryMatch) { i++; continue; }

    const symbol = entryMatch[1].trim();
    i++;

    let message = "";
    let file = "<unknown>";
    let line: number | null = null;

    let seenFailureLine = false;
    while (i < lines.length && !ENTRY_RE.test(lines[i]) && !TERMINATOR_RE.test(lines[i])) {
      const locMatch = LOC_RE.exec(lines[i]);
      if (locMatch && file === "<unknown>") {
        file = relativizePath(locMatch[1].replace(/^\.\//, ""), input.projectRoot);
        line = parseInt(locMatch[2], 10);
        i++; continue;
      }
      if (!seenFailureLine && FAILURE_RE.test(lines[i])) {
        seenFailureLine = true;
        i++; continue;
      }
      if (seenFailureLine && !message) {
        const trimmed = lines[i].trim();
        if (trimmed && !trimmed.startsWith("#")) {
          message = trimmed;
        }
      }
      i++;
    }

    out.push({
      file,
      line,
      column: null,
      type: "error",
      message: message || symbol,
      symbol,
      ...(message ? { context: message } : {})
    });
  }

  return out;
}
