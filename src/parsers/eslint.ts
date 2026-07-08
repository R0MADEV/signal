import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildEslintRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  const file = group.files[0];
  if (!file) return null;
  return `${originalCmd} ${file}`;
}

const FILE_LINE_RE = /^(\/[^\s]+|[^\s/][^\s]*)\.([a-zA-Z]+)$/;
const ENTRY_RE = /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)\s{2,}([\w@/_-]+)\s*$/;

const FILE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "html", "css", "scss", "less"
]);

export function parseEslint(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined = input.stderr.length === 0
    ? input.stdout
    : `${input.stdout}\n${input.stderr}`;

  let currentFile: string | null = null;
  for (const rawLine of combined.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.length === 0) {
      currentFile = null;
      continue;
    }

    const fileMatch = FILE_LINE_RE.exec(line);
    if (fileMatch && FILE_EXTENSIONS.has(fileMatch[2].toLowerCase())) {
      currentFile = relativizePath(line, input.projectRoot);
      continue;
    }

    if (currentFile) {
      const entry = ENTRY_RE.exec(line);
      if (entry) {
        const [, lineStr, colStr, level, message, rule] = entry;
        out.push({
          file: currentFile,
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          type: level,
          message,
          symbol: rule
        });
      }
    }
  }
  return out;
}
