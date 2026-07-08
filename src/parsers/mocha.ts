import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const FAILING_RE = /^\s+\d+ failing\s*$/;
const ENTRY_RE = /^\s+\d+\) (.+):$/;
const AT_RE = /at\s+\S+\s+\((.+):(\d+):(\d+)\)|at\s+(.+):(\d+):(\d+)/;
const MSG_RE = /^\s{5}(.+)$/;

export function parseMocha(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let i = 0;
  while (i < lines.length && !FAILING_RE.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;

  while (i < lines.length) {
    // skip blank lines between entries
    if (!lines[i].trim()) { i++; continue; }

    const entryMatch = ENTRY_RE.exec(lines[i]);
    if (!entryMatch) { i++; continue; }

    const symbol = entryMatch[1].trim();
    i++;

    let message = "";
    let file = "<unknown>";
    let line: number | null = null;
    let column: number | null = null;

    while (i < lines.length && !ENTRY_RE.test(lines[i])) {
      const atMatch = AT_RE.exec(lines[i]);
      if (atMatch && file === "<unknown>") {
        const f = atMatch[1] ?? atMatch[4];
        const l = atMatch[2] ?? atMatch[5];
        const c = atMatch[3] ?? atMatch[6];
        if (f) file = relativizePath(f, input.projectRoot);
        if (l) line = parseInt(l, 10);
        if (c) column = parseInt(c, 10);
        i++;
        continue;
      }
      if (!message) {
        const msgMatch = MSG_RE.exec(lines[i]);
        if (msgMatch && !lines[i].trim().startsWith("at ")) {
          message = msgMatch[1].trim();
        }
      }
      i++;
    }

    out.push({
      file: file === "<unknown>" ? "<unknown>" : file,
      line,
      column,
      type: "error",
      message: message || symbol,
      symbol,
      ...(message ? { context: message } : {})
    });
  }

  return out;
}
