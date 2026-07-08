import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

// file:line:col: SEVERITY: [Correctable] RuleName: message
const OFFENSE_RE = /^(.+):(\d+):(\d+):\s+([CWRFE]):\s+(?:\[Correctable\]\s+)?([A-Za-z]+\/[A-Za-z/]+):\s+(.+)$/;

const ERROR_SEVERITIES = new Set(["E", "F"]);

export function parseRubocop(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const out: ParsedError[] = [];

  for (const rawLine of combined.split("\n")) {
    const m = OFFENSE_RE.exec(rawLine.trim());
    if (!m) continue;

    const [, file, lineStr, colStr, severity, rule, message] = m;
    out.push({
      file: relativizePath(file, input.projectRoot),
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      type: ERROR_SEVERITIES.has(severity) ? "error" : "warning",
      message: message.trim(),
      symbol: rule
    });
  }

  return out;
}
