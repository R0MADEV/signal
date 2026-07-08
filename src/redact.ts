import { Transform } from "node:stream";

const KV_HIGH_ENTROPY_RE =
  /\b(api[_-]?key|apikey|secret|access[_-]?token|client[_-]?secret|token|bearer|auth)\s*[:=]\s*['"]?([^\s'"&]{8,})['"]?/gi;
const KV_PASSWORD_RE =
  /\b(password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"&]+)['"]?/gi;

const GITHUB_RE = /\bgh[psru]_[A-Za-z0-9]{36,}\b/g;
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;
const SLACK_RE = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const STRIPE_RE = /\bsk_(live|test)_[A-Za-z0-9]{24,}\b/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const DB_URL_RE =
  /\b(mysql|postgres|postgresql|mongodb|redis|amqp):\/\/([^:\s/@]+):([^@\s]+)(@)/gi;

export function redactSecrets(text: string, customPatterns: RegExp[] = []): string {
  if (text.length === 0) return text;

  let result = text;

  result = result.replace(KV_HIGH_ENTROPY_RE, (_full, key) => `${key}=[REDACTED]`);
  result = result.replace(KV_PASSWORD_RE, (_full, key) => `${key}=[REDACTED]`);
  result = result.replace(GITHUB_RE, "[REDACTED]");
  result = result.replace(AWS_KEY_RE, "[REDACTED]");
  result = result.replace(SLACK_RE, "[REDACTED]");
  result = result.replace(STRIPE_RE, "[REDACTED]");
  result = result.replace(JWT_RE, "[REDACTED]");
  result = result.replace(DB_URL_RE, (_full, scheme, user, _pass, at) => {
    return `${scheme}://${user}:[REDACTED]${at}`;
  });

  for (const re of customPatterns) {
    result = result.replace(re, "[REDACTED]");
  }

  return result;
}

export function createRedactStream(customPatterns: RegExp[] = []): Transform {
  let buffer = "";
  return new Transform({
    transform(chunk: Buffer | string, _enc, cb) {
      buffer += chunk.toString();
      const lastNewline = buffer.lastIndexOf("\n");
      if (lastNewline >= 0) {
        const complete = buffer.slice(0, lastNewline + 1);
        buffer = buffer.slice(lastNewline + 1);
        this.push(redactSecrets(complete, customPatterns));
      }
      cb();
    },
    flush(cb) {
      if (buffer.length > 0) {
        this.push(redactSecrets(buffer, customPatterns));
        buffer = "";
      }
      cb();
    }
  });
}

export function compileCustomPatterns(patterns: string[] | undefined): RegExp[] {
  if (!patterns) return [];
  return patterns.map((p) => {
    try {
      return new RegExp(p, "g");
    } catch (e) {
      throw new Error(
        `Invalid redact pattern '${p}': ${(e as Error).message}`
      );
    }
  });
}
