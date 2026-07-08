import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

// "  1) [chromium] › auth/login.spec.ts:25:5 › Login › should show error ───"
const FAIL_HEADER_RE = /^\s+\d+\)\s+\[[^\]]+\]\s+›\s+(.+?):(\d+):(\d+)\s+›\s+(.+?)\s*─*\s*$/;
const AT_RE = /at\s+(.+):(\d+):(\d+)\s*$/;
const MSG_RE = /^\s{4}(Error:.+|expect\(.+)$/;

export function parsePlaywright(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let i = 0;
  while (i < lines.length) {
    const headerMatch = FAIL_HEADER_RE.exec(lines[i]);
    if (!headerMatch) {
      i++;
      continue;
    }

    const headerFile = relativizePath(headerMatch[1], input.projectRoot);
    const headerLine = parseInt(headerMatch[2], 10);
    const headerCol = parseInt(headerMatch[3], 10);
    const symbol = headerMatch[4].trim();
    i++;

    let message = "";
    let file = headerFile;
    let line = headerLine;
    let column = headerCol;

    while (i < lines.length && !FAIL_HEADER_RE.test(lines[i])) {
      if (!message) {
        const msgMatch = MSG_RE.exec(lines[i]);
        if (msgMatch) message = msgMatch[1].trim();
      }
      const atMatch = AT_RE.exec(lines[i]);
      if (atMatch) {
        file = relativizePath(atMatch[1], input.projectRoot);
        line = parseInt(atMatch[2], 10);
        column = parseInt(atMatch[3], 10);
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
