import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnvFile, loadEnvFile, autoLoadEnvFiles } from "../src/env_file.js";

let dir: string;
const CLEANUP_KEYS = new Set<string>();

function setTestEnv(key: string, value: string) {
  process.env[key] = value;
  CLEANUP_KEYS.add(key);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "signal-envfile-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of CLEANUP_KEYS) delete process.env[k];
  CLEANUP_KEYS.clear();
});

describe("parseEnvFile", () => {
  it("parses KEY=VALUE lines", () => {
    const out = parseEnvFile("FOO=bar\nBAZ=qux");
    expect(out).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores blank lines and comments", () => {
    const out = parseEnvFile("# a comment\n\nFOO=bar\n  # indented comment\nBAZ=qux\n");
    expect(out).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("trims whitespace around key and value", () => {
    const out = parseEnvFile("  FOO = bar  ");
    expect(out).toEqual({ FOO: "bar" });
  });

  it("strips surrounding single and double quotes from value", () => {
    const out = parseEnvFile('A="quoted"\nB=\'single\'');
    expect(out).toEqual({ A: "quoted", B: "single" });
  });

  it("keeps '=' characters in the value", () => {
    const out = parseEnvFile("URL=postgres://u:p@host/db?x=1");
    expect(out).toEqual({ URL: "postgres://u:p@host/db?x=1" });
  });

  it("returns empty object for empty input", () => {
    expect(parseEnvFile("")).toEqual({});
  });
});

describe("loadEnvFile", () => {
  it("loads variables into process.env", () => {
    const path = join(dir, ".env");
    writeFileSync(path, "SIGNAL_TEST_A=hello");
    CLEANUP_KEYS.add("SIGNAL_TEST_A");
    loadEnvFile(path);
    expect(process.env.SIGNAL_TEST_A).toBe("hello");
  });

  it("does NOT overwrite variables already defined", () => {
    setTestEnv("SIGNAL_TEST_B", "original");
    const path = join(dir, ".env");
    writeFileSync(path, "SIGNAL_TEST_B=from_file");
    loadEnvFile(path);
    expect(process.env.SIGNAL_TEST_B).toBe("original");
  });

  it("does not throw when the file does not exist", () => {
    expect(() => loadEnvFile(join(dir, "missing.env"))).not.toThrow();
  });
});

describe("autoLoadEnvFiles", () => {
  it("loads signal.env sitting next to the config file", () => {
    const configPath = join(dir, "signal.config.json");
    writeFileSync(join(dir, "signal.env"), "SIGNAL_TEST_C=auto");
    CLEANUP_KEYS.add("SIGNAL_TEST_C");
    autoLoadEnvFiles(configPath);
    expect(process.env.SIGNAL_TEST_C).toBe("auto");
  });

  it("loads the file pointed to by SIGNAL_ENV_FILE", () => {
    const custom = join(dir, "custom.env");
    writeFileSync(custom, "SIGNAL_TEST_D=custom");
    CLEANUP_KEYS.add("SIGNAL_TEST_D");
    setTestEnv("SIGNAL_ENV_FILE", custom);
    autoLoadEnvFiles(join(dir, "signal.config.json"));
    expect(process.env.SIGNAL_TEST_D).toBe("custom");
  });

  it("does nothing when neither file exists", () => {
    expect(() => autoLoadEnvFiles(join(dir, "signal.config.json"))).not.toThrow();
  });
});
