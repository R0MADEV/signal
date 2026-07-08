import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildVitestRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  const file = group.occurrences[0]?.file ?? group.files[0];
  if (!file) return null;
  if (!group.symbol) return `${originalCmd} ${file}`;
  const lastSeg = group.symbol.includes(" > ")
    ? group.symbol.split(" > ").pop()!
    : group.symbol;
  return `${originalCmd} -t "${lastSeg}" ${file}`;
}

const FAILED_TESTS_DIVIDER_RE = /Failed Tests \d+/;
const FAIL_HEADER_RE = /^\s+FAIL\s+(.+?)\s+>\s+(.+)$/;
const POS_RE = /^\s+❯\s+(.+?\.[a-zA-Z]+):(\d+):(\d+)\s*$/;

export function parseVitest(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");

  let i = 0;
  while (i < lines.length && !FAILED_TESTS_DIVIDER_RE.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;

  while (i < lines.length) {
    const failMatch = FAIL_HEADER_RE.exec(lines[i]);
    if (!failMatch) {
      i++;
      continue;
    }

    const filePath = failMatch[1];
    const testPath = failMatch[2];
    i++;

    let message = "";
    let posFile: string | null = null;
    let posLine: number | null = null;
    let posCol: number | null = null;

    while (i < lines.length && !FAIL_HEADER_RE.test(lines[i])) {
      const m = POS_RE.exec(lines[i]);
      if (m && !posFile) {
        posFile = m[1];
        posLine = parseInt(m[2], 10);
        posCol = parseInt(m[3], 10);
      } else if (lines[i].trim() && !message) {
        message = lines[i].trim();
      }
      i++;
    }

    out.push({
      file: relativizePath(posFile ?? filePath, input.projectRoot),
      line: posLine,
      column: posCol,
      type: "error",
      message: message || "(no message)",
      symbol: testPath
    });
  }

  return out;
}
