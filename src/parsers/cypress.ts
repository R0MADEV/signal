import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const RUNNING_RE = /^\s+\(Running:\s+(.+)\)$/;
const FAIL_ENTRY_RE = /^\s+\d+\)\s+(.+):$/;
const AT_RE = /at\s+\S+\s+\((.+):(\d+):(\d+)\)|at\s+(.+):(\d+):(\d+)/;
const MSG_RE = /^\s{7}(.+)$/;

export function parseCypress(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let currentFile: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const runningMatch = RUNNING_RE.exec(lines[i]);
    if (runningMatch) {
      currentFile = relativizePath(runningMatch[1].trim(), input.projectRoot);
      i++;
      continue;
    }

    const failMatch = FAIL_ENTRY_RE.exec(lines[i]);
    if (!failMatch) {
      i++;
      continue;
    }

    const symbol = failMatch[1].trim();
    i++;

    let message = "";
    let file = currentFile ?? "<unknown>";
    let line: number | null = null;
    let column: number | null = null;

    while (i < lines.length && !FAIL_ENTRY_RE.test(lines[i]) && !RUNNING_RE.test(lines[i])) {
      if (!message) {
        const msgMatch = MSG_RE.exec(lines[i]);
        if (msgMatch && !lines[i].trim().startsWith("at ")) {
          message = msgMatch[1].trim();
        }
      }
      const atMatch = AT_RE.exec(lines[i]);
      if (atMatch && line === null) {
        const f = atMatch[1] ?? atMatch[4];
        const l = atMatch[2] ?? atMatch[5];
        const c = atMatch[3] ?? atMatch[6];
        if (f) file = relativizePath(f, input.projectRoot);
        if (l) line = parseInt(l, 10);
        if (c) column = parseInt(c, 10);
      }
      i++;
    }

    out.push({
      file,
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
