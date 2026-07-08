import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

interface BiomeDiagnostic {
  category?: string;
  severity?: string;
  description?: string;
  message?: string;
  location?: {
    path?: { file?: string };
    span?: { start?: { line?: number; column?: number } };
  };
}

interface BiomeOutput {
  diagnostics?: BiomeDiagnostic[];
}

const ERROR_LEVELS = new Set(["error", "fatal"]);
const WARNING_LEVELS = new Set(["warning", "warn"]);

export function parseBiome(input: ParserInput): ParsedError[] {
  const raw = input.stdout || input.stderr;
  if (!raw.trim()) return [];

  let parsed: BiomeOutput;
  try {
    parsed = JSON.parse(raw) as BiomeOutput;
  } catch {
    return [];
  }

  const diagnostics = parsed.diagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return [];

  const out: ParsedError[] = [];
  for (const d of diagnostics) {
    const file = d.location?.path?.file;
    const start = d.location?.span?.start;
    if (!file || !start) continue;

    const severity = (d.severity ?? "error").toLowerCase();
    const isWarning = WARNING_LEVELS.has(severity);
    const isError = ERROR_LEVELS.has(severity);
    if (!isError && !isWarning) continue;

    out.push({
      file: relativizePath(file, input.projectRoot),
      line: start.line ?? null,
      column: start.column ?? null,
      type: isWarning ? "warning" : "error",
      message: d.message ?? d.description ?? "(no message)",
      symbol: d.category
    });
  }
  return out;
}
