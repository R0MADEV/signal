import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildPhpunitRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  if (!group.symbol) return null;
  const escaped = group.symbol.replace(/\\/g, "\\\\");
  return `${originalCmd} --filter '${escaped}'`;
}

const SECTION_RE = /^There (was|were) \d+ (failure|error)s?:?\s*$/;
const ENTRY_RE = /^\d+\)\s+(.+)$/;
const POS_RE = /^(.+\.php):(\d+)\s*$/;
const TERMINATOR_RE = /^(FAILURES!|ERRORS!|OK\b|--\s*$)/;

export function parsePhpunit(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");

  let i = 0;
  while (i < lines.length) {
    if (!SECTION_RE.test(lines[i])) {
      i++;
      continue;
    }
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (TERMINATOR_RE.test(line) || SECTION_RE.test(line)) break;

      const entryMatch = ENTRY_RE.exec(line);
      if (!entryMatch) {
        i++;
        continue;
      }

      const symbol = entryMatch[1].trim();
      i++;

      let message = "";
      let posFile: string | null = null;
      let posLine: number | null = null;

      while (i < lines.length) {
        const next = lines[i];
        if (ENTRY_RE.test(next) || TERMINATOR_RE.test(next) || SECTION_RE.test(next)) break;

        const posMatch = POS_RE.exec(next);
        if (posMatch && !posFile) {
          posFile = posMatch[1];
          posLine = parseInt(posMatch[2], 10);
          i++;
          break;
        }
        if (next.trim() && !message) {
          message = next.trim();
        }
        i++;
      }

      out.push({
        file: posFile ? relativizePath(posFile, input.projectRoot) : "<unknown>",
        line: posLine,
        column: null,
        type: "error",
        message: message || "(no message)",
        symbol
      });
    }
  }

  return out;
}
