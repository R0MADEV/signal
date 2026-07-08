import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildBehatRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  const occ = group.occurrences[0];
  if (!occ || occ.line === null) return null;
  return `${originalCmd} ${occ.file}:${occ.line} -vv`;
}

const FAILED_SECTION_RE = /^-{2,}\s*Failed scenarios:?\s*$/;
const FEATURE_PATH_RE = /^\s+(.+?\.feature):(\d+)\s*$/;
const SCENARIO_HEADER_RE =
  /^\s+Scenario(?:\s+Outline)?:\s+(.+?)\s+#\s+(.+?\.feature):(\d+)\s*$/;
const EXCEPTION_RE = /\((?:[\w]+(?:\\[\w]+)+)\)\s*$/;
const STATS_LINE_RE = /^\d+\s+scenario|\d+\s+step/;

interface ScenarioBlock {
  title: string;
  exception: string | null;
}

export function parseBehat(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const lines = combined.split("\n");

  const scenarioBlocks = new Map<string, ScenarioBlock>();
  let current: { key: string; block: ScenarioBlock } | null = null;
  for (const line of lines) {
    const headerMatch = SCENARIO_HEADER_RE.exec(line);
    if (headerMatch) {
      if (current) scenarioBlocks.set(current.key, current.block);
      const file = headerMatch[2];
      const lineNum = headerMatch[3];
      current = {
        key: `${file}:${lineNum}`,
        block: { title: headerMatch[1].trim(), exception: null }
      };
      continue;
    }
    if (current) {
      const trimmed = line.trim();
      if (trimmed && EXCEPTION_RE.test(trimmed)) {
        const m = /\(([^()]+)\)\s*$/.exec(trimmed);
        if (m) current.block.exception = m[1].trim();
      }
    }
  }
  if (current) scenarioBlocks.set(current.key, current.block);

  let i = 0;
  while (i < lines.length && !FAILED_SECTION_RE.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || STATS_LINE_RE.test(line.trim())) {
      i++;
      if (line.trim() !== "") break;
      continue;
    }
    const m = FEATURE_PATH_RE.exec(line);
    if (m) {
      const file = relativizePath(m[1], input.projectRoot);
      const lineNum = parseInt(m[2], 10);
      const key = `${m[1]}:${m[2]}`;
      const block = scenarioBlocks.get(key);
      const symbol = block?.title ?? `${file}:${lineNum}`;
      const message = block?.exception
        ? `${block.exception}`
        : "Behat scenario failed";
      out.push({
        file,
        line: lineNum,
        column: null,
        type: "error",
        message,
        symbol
      });
    }
    i++;
  }

  return out;
}
