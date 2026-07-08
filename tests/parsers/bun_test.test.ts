import { describe, it, expect } from "vitest";
import { parseBunTest } from "../../src/parsers/bun_test.js";

const ROOT = "/workspace";

describe("parseBunTest", () => {
  it("returns [] for empty input", () => {
    expect(parseBunTest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "bun test v1.2.0",
      "",
      "src/foo.test.ts:",
      "✓ adds numbers (1ms)",
      "",
      "1 pass (12ms)"
    ].join("\n");
    expect(parseBunTest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a failing test with location", () => {
    const stdout = [
      "bun test v1.2.0",
      "",
      "src/foo.test.ts:",
      "✗ subtracts numbers",
      "",
      "  error: expect(received).toBe(expected)",
      "  Expected: 3",
      "  Received: 0",
      "",
      "      at /workspace/src/foo.test.ts:10:20",
      "",
      "1 fail"
    ].join("\n");
    const out = parseBunTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/foo.test.ts",
      line: 10,
      column: 20,
      type: "error",
      symbol: "subtracts numbers"
    });
  });

  it("captures the error message", () => {
    const stdout = [
      "src/foo.test.ts:",
      "✗ my test",
      "",
      "  error: expect(received).toBe(expected)",
      "",
      "      at /workspace/src/foo.test.ts:5:1"
    ].join("\n");
    const out = parseBunTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("expect(received).toBe(expected)");
  });

  it("parses multiple failing tests", () => {
    const stdout = [
      "src/a.test.ts:",
      "✗ test one",
      "  error: boom",
      "      at /workspace/src/a.test.ts:1:1",
      "",
      "src/b.test.ts:",
      "✗ test two",
      "  error: crash",
      "      at /workspace/src/b.test.ts:2:2",
      "",
      "2 fail"
    ].join("\n");
    const out = parseBunTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("src/a.test.ts");
    expect(out[1].file).toBe("src/b.test.ts");
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "✗ my test",
      "  error: boom",
      "      at /workspace/src/foo.test.ts:1:1"
    ].join("\n");
    const out = parseBunTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("src/foo.test.ts");
  });

  it("also parses from stderr", () => {
    const stderr = [
      "✗ my test",
      "  error: boom",
      "      at /workspace/src/foo.test.ts:3:5"
    ].join("\n");
    const out = parseBunTest({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("falls back to file from section header when no at-line found", () => {
    const stdout = [
      "src/foo.test.ts:",
      "✗ broken test",
      "  error: something"
    ].join("\n");
    const out = parseBunTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("src/foo.test.ts");
    expect(out[0].line).toBeNull();
  });
});
