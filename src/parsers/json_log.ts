import type { ParsedError, ParserInput } from "./types.js";
import { relativizePath } from "./util.js";

const ERROR_LEVELS = new Set(["error", "err", "critical", "crit", "fatal", "severe"]);
const WARNING_LEVELS = new Set(["warning", "warn"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getLevel(obj: Record<string, unknown>): string {
  return String(obj.level ?? obj.severity ?? obj.loglevel ?? "").toLowerCase();
}

function getMessage(obj: Record<string, unknown>): string {
  return String(obj.message ?? obj.msg ?? obj.text ?? "");
}

function getFile(obj: Record<string, unknown>): string {
  return String(obj.file ?? obj.filename ?? obj.module ?? "<unknown>");
}

function getLine(obj: Record<string, unknown>): number | null {
  const raw = obj.line ?? obj.lineno ?? obj.line_number ?? null;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseJsonLog(input: ParserInput): ParsedError[] {
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  const out: ParsedError[] = [];

  for (const rawLine of combined.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isRecord(parsed)) continue;

    const level = getLevel(parsed);
    const isError = ERROR_LEVELS.has(level);
    const isWarning = WARNING_LEVELS.has(level);
    if (!isError && !isWarning) continue;

    const file = getFile(parsed);
    out.push({
      file: file === "<unknown>" ? "<unknown>" : relativizePath(file, input.projectRoot),
      line: getLine(parsed),
      column: null,
      type: isWarning ? "warning" : "error",
      message: getMessage(parsed)
    });
  }
  return out;
}
