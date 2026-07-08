import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const MSBUILD_RE =
  /^([^\s(][^(]*?\.[a-zA-Z0-9]+)\((\d+),(\d+)\):\s*(error|warning|info)?\s*(?:[A-Z]+\d+)?:?\s*(.+?)\s*$/i;

const UNIX_RE = /^([^\s:][^:]*?\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?:?\s*(.+?)\s*$/;

const CONTEXT_BEFORE = 2;
const CONTEXT_AFTER = 2;

function extractContext(lines: string[], index: number): string {
  const start = Math.max(0, index - CONTEXT_BEFORE);
  const end = Math.min(lines.length - 1, index + CONTEXT_AFTER);
  return lines.slice(start, end + 1).map(l => l.trimEnd()).join("\n");
}

export function parseGeneric(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  for (const stream of [input.stdout, input.stderr]) {
    if (!stream) continue;
    const lines = stream.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;

      const ms = MSBUILD_RE.exec(line);
      if (ms) {
        const [, file, lineStr, colStr, level, message] = ms;
        out.push({
          file: relativizePath(file, input.projectRoot),
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          type: (level ?? "error").toLowerCase(),
          message,
          context: extractContext(lines, i)
        });
        continue;
      }

      const un = UNIX_RE.exec(line);
      if (un) {
        const [, file, lineStr, colStr, message] = un;
        out.push({
          file: relativizePath(file, input.projectRoot),
          line: parseInt(lineStr, 10),
          column: colStr ? parseInt(colStr, 10) : null,
          type: "error",
          message,
          context: extractContext(lines, i)
        });
      }
    }
  }
  return out;
}
