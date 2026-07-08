import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const FAIL_FILE_RE = /^FAIL\s+(.+)$/;
const TEST_NAME_RE = /^\s+●\s+(.+)$/;
const AT_RE = /at\s+\S+\s+\((.+):(\d+):(\d+)\)|at\s+(.+):(\d+):(\d+)/;
const MSG_RE = /^\s{4}(.+)$/;

export function parseJest(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let currentFile: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const fileMatch = FAIL_FILE_RE.exec(lines[i]);
    if (fileMatch) {
      currentFile = relativizePath(fileMatch[1].trim(), input.projectRoot);
      i++;
      continue;
    }

    const nameMatch = TEST_NAME_RE.exec(lines[i]);
    if (!nameMatch) {
      i++;
      continue;
    }

    const symbol = nameMatch[1].trim();
    i++;

    let message = "";
    let file = currentFile ?? "<unknown>";
    let line: number | null = null;
    let column: number | null = null;

    while (i < lines.length && !TEST_NAME_RE.test(lines[i]) && !FAIL_FILE_RE.test(lines[i])) {
      if (!message) {
        const msgMatch = MSG_RE.exec(lines[i]);
        if (msgMatch && !lines[i].startsWith("      at ")) {
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
