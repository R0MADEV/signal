import type { ParsedError, ParserInput } from "./types.js";

const FAIL_RE = /^--- FAIL: (.+?) \(\d+\.\d+s\)$/;
const MSG_LINE_RE = /^\s+(\S+_test\.go):(\d+): (.+)$/;
const MSG_CONT_RE = /^\s{8,}(.+)$/;

export function parseGoTest(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");
  const out: ParsedError[] = [];

  let i = 0;
  while (i < lines.length) {
    const failMatch = FAIL_RE.exec(lines[i]);
    if (!failMatch) { i++; continue; }

    const symbol = failMatch[1].trim();
    i++;

    let file = "<unknown>";
    let line: number | null = null;
    let message = "";

    while (i < lines.length && !FAIL_RE.test(lines[i]) && !lines[i].startsWith("FAIL")) {
      const msgMatch = MSG_LINE_RE.exec(lines[i]);
      if (msgMatch && file === "<unknown>") {
        file = msgMatch[1];
        line = parseInt(msgMatch[2], 10);
        message = msgMatch[3].trim();
        i++;
        // collect continuation lines
        while (i < lines.length && MSG_CONT_RE.test(lines[i]) && !MSG_LINE_RE.test(lines[i])) {
          i++;
        }
        continue;
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
