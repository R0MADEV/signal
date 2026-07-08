import { z } from "zod";
import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

export function buildPhpstanRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  const file = group.files[0];
  if (!file || file === "<global>") return null;
  return `${originalCmd} ${file}`;
}

const PhpstanFileMessage = z.object({
  message: z.string(),
  line: z.number().nullable().optional()
});

const PhpstanFile = z.object({
  errors: z.number().optional(),
  messages: z.array(PhpstanFileMessage)
});

const PhpstanReport = z.object({
  files: z.union([z.record(PhpstanFile), z.array(z.unknown()).length(0)]),
  errors: z.array(z.string())
});

const UNDEFINED_METHOD_RE = /undefined method ([\w\\]+::\w+)/i;
const UNDEFINED_CLASS_RE = /undefined (?:class|type) ([\w\\]+)/i;

export function parsePhpstan(input: ParserInput): ParsedError[] {
  let raw: unknown;
  try {
    const jsonLine = input.stdout.split("\n").find((l) => l.trimStart().startsWith("{"));
    if (!jsonLine) throw new Error("no JSON object found in stdout");
    raw = JSON.parse(jsonLine);
  } catch (e) {
    throw new Error(
      `parsePhpstan: failed to parse stdout as JSON: ${(e as Error).message}`
    );
  }
  const report = PhpstanReport.parse(raw);

  const out: ParsedError[] = [];
  const filesObj = Array.isArray(report.files) ? {} : report.files;
  for (const [file, info] of Object.entries(filesObj)) {
    for (const m of info.messages) {
      out.push({
        file: relativizePath(file, input.projectRoot),
        line: typeof m.line === "number" ? m.line : null,
        column: null,
        type: "error",
        message: m.message,
        symbol: extractSymbol(m.message)
      });
    }
  }
  for (const msg of report.errors) {
    out.push({
      file: "<global>",
      line: null,
      column: null,
      type: "error",
      message: msg
    });
  }
  return out;
}

function extractSymbol(msg: string): string | undefined {
  const m1 = UNDEFINED_METHOD_RE.exec(msg);
  if (m1) return m1[1];
  const m2 = UNDEFINED_CLASS_RE.exec(msg);
  if (m2) return m2[1];
  return undefined;
}
