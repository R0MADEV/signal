import { createHash } from "node:crypto";
import type { ParsedError } from "./parsers/index.js";

export interface ErrorOccurrence {
  file: string;
  line: number | null;
  column: number | null;
  context?: string;
}

export interface ErrorGroup {
  fingerprint: string;
  type: string;
  symbol?: string;
  message: string;
  count: number;
  files: string[];
  occurrences: ErrorOccurrence[];
  step?: string;
  first_position: number;
  last_position: number;
}

export function groupErrors(errors: ParsedError[]): ErrorGroup[] {
  const buckets = new Map<string, ErrorGroup>();

  for (let pos = 0; pos < errors.length; pos++) {
    const e = errors[pos];
    const fp = fingerprint(e);
    const occurrence: ErrorOccurrence = {
      file: e.file,
      line: e.line,
      column: e.column,
      ...(e.context !== undefined ? { context: e.context } : {})
    };
    const existing = buckets.get(fp);

    if (existing) {
      existing.count += 1;
      existing.occurrences.push(occurrence);
      existing.last_position = pos;
      if (!existing.files.includes(e.file)) existing.files.push(e.file);
    } else {
      buckets.set(fp, {
        fingerprint: fp,
        type: e.type,
        symbol: e.symbol,
        message: e.message,
        count: 1,
        files: [e.file],
        occurrences: [occurrence],
        first_position: pos,
        last_position: pos
      });
    }
  }

  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

function fingerprint(e: ParsedError): string {
  const key = e.symbol
    ? `${e.type}:sym:${e.symbol}`
    : `${e.type}:msg:${normalizeMessage(e.message)}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 12);
}

function normalizeMessage(msg: string): string {
  return msg
    .replace(/'[^']*'/g, "<str>")
    .replace(/"[^"]*"/g, "<str>")
    .replace(/\/[^\s'"]+/g, "<path>")
    .replace(/\b\d+\b/g, "N")
    .trim();
}
