import { describe, it, expect } from "vitest";
import { parseVitest } from "../../src/parsers/vitest.js";

const ROOT = "/proj";

describe("parseVitest", () => {
  it("returns [] for empty input", () => {
    expect(parseVitest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] for a passing run with no failures", () => {
    const stdout = [
      " RUN  v2.1.9 /proj",
      "",
      " ✓ tests/foo.test.ts (10 tests) 3ms",
      " ✓ tests/bar.test.ts (5 tests) 8ms",
      "",
      " Test Files  2 passed (2)",
      "      Tests  15 passed (15)"
    ].join("\n");
    expect(parseVitest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single test failure with assertion message", () => {
    const stdout = [
      " RUN  v2.1.9 /proj",
      "",
      " ❯ tests/foo.test.ts (3 tests | 1 failed) 258ms",
      "   × startCheck > rejects empty name 34ms",
      "     → expected [Function] to throw an error",
      "",
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      " FAIL  tests/foo.test.ts > startCheck > rejects empty name",
      "AssertionError: expected [Function] to throw an error",
      " ❯ tests/foo.test.ts:128:2",
      "    126|     });",
      "    127|     it('rejects empty name', () => {",
      "    128|       expect(fn).toThrow();",
      "       |       ^",
      "",
      " Test Files  1 failed (1)",
      "      Tests  1 failed | 80 passed (82)"
    ].join("\n");
    const out = parseVitest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/foo.test.ts",
      line: 128,
      column: 2,
      type: "error",
      message: expect.stringContaining("expected [Function] to throw")
    });
    expect(out[0].symbol).toContain("startCheck > rejects empty name");
  });

  it("parses multiple test failures across files", () => {
    const stdout = [
      " RUN  v2.1.9 /proj",
      "",
      " ❯ tests/a.test.ts (3 tests | 1 failed) 100ms",
      "   × foo > bar 10ms",
      "     → expected 1 to be 2",
      " ❯ tests/b.test.ts (2 tests | 1 failed) 50ms",
      "   × baz > qux 5ms",
      "     → expected x to equal y",
      "",
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      " FAIL  tests/a.test.ts > foo > bar",
      "AssertionError: expected 1 to be 2",
      " ❯ tests/a.test.ts:10:5",
      "",
      " FAIL  tests/b.test.ts > baz > qux",
      "AssertionError: expected x to equal y",
      " ❯ tests/b.test.ts:20:7"
    ].join("\n");
    const out = parseVitest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    const files = out.map((e) => e.file).sort();
    expect(files).toEqual(["tests/a.test.ts", "tests/b.test.ts"]);
  });

  it("uses the test name (with describe path) as the symbol for grouping", () => {
    const stdout = [
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      " FAIL  tests/a.test.ts > Storage > rejects empty root",
      "AssertionError: msg",
      " ❯ tests/a.test.ts:5:1"
    ].join("\n");
    const out = parseVitest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toBe("Storage > rejects empty root");
  });

  it("relativizes absolute paths under projectRoot", () => {
    const stdout = [
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      " FAIL  /proj/tests/deep/nested/x.test.ts > foo",
      "AssertionError: oops",
      " ❯ /proj/tests/deep/nested/x.test.ts:42:1"
    ].join("\n");
    const out = parseVitest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("tests/deep/nested/x.test.ts");
  });

  it("handles failures without an exact ❯ position by leaving line/column null", () => {
    const stdout = [
      "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
      "",
      " FAIL  tests/a.test.ts > some test",
      "Error: setup failed",
      ""
    ].join("\n");
    const out = parseVitest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/a.test.ts",
      line: null,
      column: null,
      message: expect.stringContaining("Error: setup failed")
    });
  });
});
