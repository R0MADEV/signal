import type { ParsedError, ParserInput, RerunGroup } from "./types.js";
import { relativizePath } from "./util.js";

const TESTCASE_RE =
  /<testcase\b([^>]*?)\/>|<testcase\b([^>]*?)>([\s\S]*?)<\/testcase>/g;
const FAILURE_RE = /<(failure|error)\b([^>]*?)>([\s\S]*?)<\/\1>/;
const SELF_CLOSING_FAILURE_RE = /<(failure|error)\b([^>]*?)\/>/;
const ATTR_RE = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
const POS_FALLBACK_RE = /(\/?[^\s:]+\.[a-zA-Z]+):(\d+)/;

function bestMessageFromBody(body: string, exclude: string[]): string {
  if (!body) return "(no message)";
  const excludeSet = new Set(exclude.filter((s) => s));
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (excludeSet.has(line)) continue;
    if (/^[\/.][^\s]+:\d+\s*$/.test(line)) continue;
    return line;
  }
  return body.split("\n").map((l) => l.trim()).find((l) => l) ?? "(no message)";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    out[m[1]] = decodeXmlEntities(m[2]);
  }
  return out;
}

export function parseJunit(input: ParserInput): ParsedError[] {
  const out: ParsedError[] = [];
  const combined =
    input.stderr.length === 0 ? input.stdout : `${input.stdout}\n${input.stderr}`;
  if (!combined.includes("<testcase")) return out;

  for (const m of combined.matchAll(TESTCASE_RE)) {
    const attrsRaw = m[1] ?? m[2];
    const inner = m[3] ?? "";
    const attrs = parseAttrs(attrsRaw);

    let failureAttrs: Record<string, string> | null = null;
    let failureBody = "";
    if (inner) {
      const fm = FAILURE_RE.exec(inner);
      if (fm) {
        failureAttrs = parseAttrs(fm[2]);
        failureBody = decodeXmlEntities(fm[3]).trim();
      } else {
        const fmSelf = SELF_CLOSING_FAILURE_RE.exec(inner);
        if (fmSelf) {
          failureAttrs = parseAttrs(fmSelf[2]);
        }
      }
    }
    if (!failureAttrs) continue;

    const className = attrs.classname ?? "";
    const testName = attrs.name ?? "";
    const symbol = className ? `${className}::${testName}` : testName;
    const altSymbol = attrs.class ? `${attrs.class}::${testName}` : symbol;

    let file: string = attrs.file ?? "";
    let line: number | null = attrs.line ? parseInt(attrs.line, 10) : null;

    const bodyPos = POS_FALLBACK_RE.exec(failureBody);
    if (bodyPos) {
      file = bodyPos[1];
      line = parseInt(bodyPos[2], 10);
    }

    const message =
      failureAttrs.message ??
      bestMessageFromBody(failureBody, [symbol, altSymbol, testName]);

    out.push({
      file: file ? relativizePath(file, input.projectRoot) : "<unknown>",
      line,
      column: null,
      type: "error",
      message,
      symbol: symbol || "<unknown>"
    });
  }

  return out;
}

export function buildJunitRerunCmd(
  originalCmd: string,
  group: RerunGroup
): string | null {
  if (!group.symbol) return null;
  const escaped = group.symbol.replace(/\\/g, "\\\\");
  return `${originalCmd} --filter '${escaped}'`;
}
