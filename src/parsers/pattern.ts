import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

/**
 * Parse output using a user-supplied regex pattern.
 * Named groups (?<file>), (?<line>), (?<col>), (?<message>) map to ParsedError fields.
 * Without named groups, the first capture group (or whole match) becomes the message.
 */
export function parseWithPattern(
  input: ParserInput,
  pattern: string
): ParsedError[] {
  const re = new RegExp(pattern);
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const out: ParsedError[] = [];

  for (const line of combined.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;

    const groups = m.groups ?? {};
    const file = groups.file ?? "<unknown>";
    const lineNum = groups.line ? parseInt(groups.line, 10) : null;
    const column = groups.col ?? groups.column
      ? parseInt(groups.col ?? groups.column, 10)
      : null;
    const message = groups.message ?? m[1] ?? m[0];

    out.push({
      file: file === "<unknown>" ? "<unknown>" : relativizePath(file, input.projectRoot),
      line: lineNum,
      column,
      type: "error",
      message: message.trim(),
      ...(groups.symbol ? { symbol: groups.symbol } : {})
    });
  }

  return out;
}
