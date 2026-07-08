import { describe, it, expect } from "vitest";
import { parseJest } from "../../src/parsers/jest.js";

const ROOT = "/workspace";

describe("parseJest", () => {
  it("returns [] for empty input", () => {
    expect(parseJest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "PASS src/foo.test.ts",
      "Test Suites: 1 passed, 1 total",
      "Tests:       3 passed, 3 total"
    ].join("\n");
    expect(parseJest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a FAIL block with test name and location", () => {
    const stdout = [
      "FAIL src/auth.test.ts",
      "  ● AuthService › login › should return token",
      "",
      "    expect(received).toBe(expected)",
      "    Expected: true",
      "    Received: false",
      "",
      "      at Object.<anonymous> (src/auth.test.ts:42:5)"
    ].join("\n");
    const out = parseJest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/auth.test.ts",
      line: 42,
      column: 5,
      type: "error",
      symbol: "AuthService › login › should return token"
    });
  });

  it("captures the assertion message", () => {
    const stdout = [
      "FAIL src/foo.test.ts",
      "  ● my test",
      "",
      "    expect(received).toBe(expected)",
      "",
      "      at src/foo.test.ts:10:3"
    ].join("\n");
    const out = parseJest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("expect(received).toBe(expected)");
  });

  it("parses multiple failures", () => {
    const stdout = [
      "FAIL src/a.test.ts",
      "  ● test one",
      "    error one",
      "      at src/a.test.ts:1:1",
      "",
      "  ● test two",
      "    error two",
      "      at src/a.test.ts:2:1"
    ].join("\n");
    const out = parseJest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].symbol).toBe("test one");
    expect(out[1].symbol).toBe("test two");
  });

  it("parses failures from stderr", () => {
    const stderr = [
      "FAIL src/foo.test.ts",
      "  ● my test",
      "    boom",
      "      at src/foo.test.ts:5:1"
    ].join("\n");
    const out = parseJest({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "FAIL /workspace/src/foo.test.ts",
      "  ● my test",
      "    boom",
      "      at /workspace/src/foo.test.ts:5:1"
    ].join("\n");
    const out = parseJest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("src/foo.test.ts");
  });

  it("falls back to FAIL file when no at-line found", () => {
    const stdout = [
      "FAIL src/foo.test.ts",
      "  ● broken test",
      "    something failed"
    ].join("\n");
    const out = parseJest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("src/foo.test.ts");
    expect(out[0].line).toBeNull();
  });
});
