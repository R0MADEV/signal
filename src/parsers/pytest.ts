import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildPytestRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  if (!group.symbol) return null;
  const file = group.occurrences[0]?.file ?? group.files[0];
  if (!file) return null;
  return `${originalCmd} ${file}::${group.symbol} -v`;
}

// The " - message" suffix is only present with some pytest configs; make it optional.
const FAILED_RE = /^FAILED\s+(.+?\.py)::(.+?)(?:\s+-\s+(.+))?$/;
const POS_RE = /^(.+\.py):(\d+):\s*.+/;
const E_LINE_RE = /^E\s+(.+)$/;

export function parsePytest(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");

  const failed: Array<{ file: string; symbol: string; message: string }> = [];
  for (const line of lines) {
    const m = FAILED_RE.exec(line.trim());
    if (m) {
      failed.push({
        file: relativizePath(m[1], input.projectRoot),
        symbol: m[2].trim(),
        message: m[3]?.trim() ?? ""
      });
    }
  }

  if (failed.length === 0) return [];

  // Build file → line map and file → E-message map from full output
  const lineMap = new Map<string, number>();
  const msgMap = new Map<string, string>();

  for (const raw of lines) {
    const posMatch = POS_RE.exec(raw.trim());
    if (posMatch) {
      const f = relativizePath(posMatch[1], input.projectRoot);
      if (!lineMap.has(f)) lineMap.set(f, parseInt(posMatch[2], 10));
    }
    const eMatch = E_LINE_RE.exec(raw);
    if (eMatch && failed.length > 0) {
      const lastFile = failed[failed.length - 1].file;
      if (!msgMap.has(lastFile)) msgMap.set(lastFile, eMatch[1].trim());
    }
  }

  return failed.map(({ file, symbol, message }) => {
    const ctx = msgMap.get(file);
    return {
      file,
      line: lineMap.get(file) ?? null,
      column: null,
      type: "error" as const,
      message: ctx || message || symbol,
      symbol,
      ...(ctx ? { context: ctx } : {})
    };
  });
}
