import type { ParsedError, ParserInput } from "./types.js";

// Docker log line format (Symfony monolog via syslog driver):
// 2026-05-08T19:50:55.546328+00:00 container facility[pid]: channel.LEVEL: message {context} []
const LOG_LINE_RE =
  /^\S+\s+\S+\s+\S+:\s+(\w+)\.(ERROR|CRITICAL|ALERT|EMERGENCY|WARNING):\s+(.+?)\s+(\{.*\}|\[\])\s*(?:\[\])?\s*$/;

const LEVELS_TO_CAPTURE = new Set(["ERROR", "CRITICAL", "ALERT", "EMERGENCY", "WARNING"]);

export function parseSymfonyLog({ stdout, stderr }: ParserInput): ParsedError[] {
  const combined = stderr ? `${stdout}\n${stderr}` : stdout;
  const errors: ParsedError[] = [];

  for (const line of combined.split("\n")) {
    const m = LOG_LINE_RE.exec(line.trim());
    if (!m) continue;

    const [, channel, level, message, contextRaw] = m;
    if (!LEVELS_TO_CAPTURE.has(level)) continue;

    let context = "";
    if (contextRaw && contextRaw !== "[]") {
      try {
        const parsed = JSON.parse(contextRaw);
        const entries = Object.entries(parsed);
        if (entries.length > 0) {
          context = " " + entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
        }
      } catch {
        context = " " + contextRaw;
      }
    }

    errors.push({
      type: level.toLowerCase(),
      file: channel,
      line: null,
      column: null,
      message: message.trim() + context
    });
  }

  return errors;
}
