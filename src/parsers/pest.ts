import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildPestRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  if (!group.symbol) return null;
  const testName = group.symbol.includes(" > ")
    ? group.symbol.split(" > ").slice(1).join(" > ")
    : group.symbol;
  return `${originalCmd} --filter '${testName}'`;
}

const FAILED_TEST_RE = /^\s*⨯\s+(.+?)\s+\d+(?:\.\d+)?s\s*$/;
const HEADER_RE = /^\s*─{3,}\s+(.+?)\s+─{3,}\s*$/;
const AT_POS_RE = /^\s*at\s+(.+?\.[a-zA-Z]+):(\d+)\s*$/;

export function parsePest(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");

  let i = 0;
  while (i < lines.length) {
    const failedMatch = FAILED_TEST_RE.exec(lines[i]);
    if (!failedMatch) {
      i++;
      continue;
    }
    const testNameInline = failedMatch[1].trim();
    i++;

    let symbolFromHeader: string | null = null;
    let message = "";
    let posFile: string | null = null;
    let posLine: number | null = null;

    while (i < lines.length) {
      const next = lines[i];
      if (FAILED_TEST_RE.test(next)) break;

      const headerMatch = HEADER_RE.exec(next);
      if (headerMatch && !symbolFromHeader) {
        symbolFromHeader = headerMatch[1].trim();
        i++;
        continue;
      }

      const atMatch = AT_POS_RE.exec(next);
      if (atMatch && !posFile) {
        posFile = atMatch[1];
        posLine = parseInt(atMatch[2], 10);
        i++;
        break;
      }

      const trimmed = next.trim();
      if (
        trimmed &&
        !message &&
        !trimmed.startsWith("─") &&
        !trimmed.startsWith("Tests:") &&
        !trimmed.startsWith("Duration:")
      ) {
        message = trimmed;
      }
      i++;
    }

    out.push({
      file: posFile ? relativizePath(posFile, input.projectRoot) : "<unknown>",
      line: posLine,
      column: null,
      type: "error",
      message: message || "(no message)",
      symbol: symbolFromHeader ?? testNameInline
    });
  }

  return out;
}
