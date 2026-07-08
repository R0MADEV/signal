import { describe, it, expect } from "vitest";
import { parsePest } from "../../src/parsers/pest.js";

const ROOT = "/app";

describe("parsePest", () => {
  it("returns [] for empty input", () => {
    expect(parsePest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] for a passing run", () => {
    const stdout = [
      "   PASS  Tests\\Unit\\ExampleTest",
      "  ✓ example",
      "",
      "  Tests:    1 passed (1 assertions)",
      "  Duration: 0.05s"
    ].join("\n");
    expect(parsePest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single failure with at-line position", () => {
    const stdout = [
      "   FAIL  Tests\\Unit\\BrokenTest",
      "  ⨯ it does the thing                                                0.01s",
      "",
      "  ──── Tests\\Unit\\BrokenTest > it does the thing ────",
      "  Failed asserting that false is true.",
      "",
      "  at tests/Unit/BrokenTest.php:14",
      "",
      "  Tests:    1 failed, 1 passed (2 assertions)"
    ].join("\n");
    const out = parsePest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/Unit/BrokenTest.php",
      line: 14,
      column: null,
      type: "error",
      symbol: expect.stringContaining("it does the thing"),
      message: expect.stringContaining("Failed asserting that false is true")
    });
  });

  it("parses multiple failures across files", () => {
    const stdout = [
      "  ⨯ first failing test                                              0.01s",
      "",
      "  ──── A > first failing test ────",
      "  First message",
      "",
      "  at tests/A.php:10",
      "",
      "  ⨯ second failing test                                             0.02s",
      "",
      "  ──── B > second failing test ────",
      "  Second message",
      "",
      "  at tests/B.php:20",
      ""
    ].join("\n");
    const out = parsePest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.file).sort()).toEqual(["tests/A.php", "tests/B.php"]);
  });

  it("relativizes absolute paths under projectRoot", () => {
    const stdout = [
      "  ⨯ test x                                                          0.01s",
      "",
      "  ──── X > test x ────",
      "  msg",
      "",
      "  at /app/deep/nested/X.php:42"
    ].join("\n");
    const out = parsePest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("deep/nested/X.php");
  });

  it("falls back to file=<unknown> when no 'at file:line' is present", () => {
    const stdout = [
      "  ⨯ orphan failure                                                  0.01s",
      "",
      "  ──── X > orphan failure ────",
      "  message without source position",
      "",
      "  Tests:    1 failed"
    ].join("\n");
    const out = parsePest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].line).toBeNull();
    expect(out[0].message).toContain("message without source position");
  });
});
