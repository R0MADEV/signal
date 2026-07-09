import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Parse a minimal .env file body into a key/value map. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (key.length === 0) continue;

    let value = line.slice(eq + 1).trim();
    value = stripQuotes(value);
    out[key] = value;
  }
  return out;
}

function stripQuotes(value: string): string {
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
  if ((isDoubleQuoted || isSingleQuoted) && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

/** Load a .env file into process.env without overwriting existing variables. */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const parsed = parseEnvFile(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Load env vars at startup: first a `signal.env` sitting next to the config,
 * then the file pointed to by SIGNAL_ENV_FILE (which takes precedence since
 * loadEnvFile never overwrites already-set vars — later calls fill only gaps).
 */
export function autoLoadEnvFiles(configPath: string): void {
  const envFile = process.env.SIGNAL_ENV_FILE;
  if (envFile) loadEnvFile(envFile);
  loadEnvFile(join(dirname(configPath), "signal.env"));
}
