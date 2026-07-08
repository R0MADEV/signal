import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const FAIL_RE = /^\s*✗\s+(.+)$/;
const FILE_HEADER_RE = /^([^\s].+\.(?:ts|tsx|js|jsx|mts|cts)):$/;
const AT_RE = /at\s+\S+\s+\((.+):(\d+):(\d+)\)|at\s+(.+):(\d+):(\d+)/;
const ERROR_RE = /^\s+error:\s+(.+)$/;

export function parseBunTest(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let currentFile: string | null = null;

  let i = 0;
  while (i < lines.length) {
    const headerMatch = FILE_HEADER_RE.exec(lines[i]);
    if (headerMatch) {
      currentFile = relativizePath(headerMatch[1], input.projectRoot);
      i++;
      continue;
    }

    const failMatch = FAIL_RE.exec(lines[i]);
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

    while (i < lines.length && !FAIL_RE.test(lines[i]) && !FILE_HEADER_RE.test(lines[i])) {
      if (!message) {
        const errMatch = ERROR_RE.exec(lines[i]);
        if (errMatch) message = errMatch[1].trim();
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
