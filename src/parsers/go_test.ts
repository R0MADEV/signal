import type { ParsedError, ParserInput, RerunGroup } from "./types.js";

export function buildGoTestRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  if (!group.symbol) return null;
  return `${originalCmd} -run "${group.symbol}" -v`;
}

const FAIL_RE = /^--- FAIL: (.+?) \(\d+\.\d+s\)$/;
// file:line: with an OPTIONAL inline message (plain go test has it, testify leaves it blank)
const MSG_LINE_RE = /^\s+(\S+_test\.go):(\d+):\s*(.*)$/;
// testify's "Error:" / "Messages:" lines carry the real message when the file:line line is blank
const TESTIFY_MSG_RE = /^\s+(?:Error|Messages):\s*\t*(.+)$/;

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
        message = msgMatch[3].trim(); // may be empty (testify)
        i++;
        continue;
      }
      // testify: pick up the "Error:" text as the message when we don't have one yet
      if (file !== "<unknown>" && !message) {
        const testifyMatch = TESTIFY_MSG_RE.exec(lines[i]);
        if (testifyMatch) message = testifyMatch[1].trim();
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
