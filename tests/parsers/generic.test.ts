import { describe, it, expect } from "vitest";
import { parseGeneric } from "../../src/parsers/generic.js";

const PROJECT_ROOT = "/abs/project";

describe("parseGeneric", () => {
  it("returns [] for empty input", () => {
    expect(parseGeneric({ stdout: "", stderr: "", projectRoot: PROJECT_ROOT })).toEqual([]);
  });

  it("parses Unix-style 'file:line:col: message' lines", () => {
    const stdout = "src/foo.ts:10:5: Cannot find name 'foo'.\nsrc/bar.ts:20:1: Unexpected token.";
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      file: "src/foo.ts",
      line: 10,
      column: 5,
      type: "error",
      message: "Cannot find name 'foo'."
    });
    expect(out[1]).toMatchObject({
      file: "src/bar.ts",
      line: 20,
      column: 1,
      message: "Unexpected token."
    });
  });

  it("parses TypeScript-style 'file(line,col): error TSxxxx: message' lines", () => {
    const stdout = "src/foo.ts(10,5): error TS2304: Cannot find name 'foo'.";
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/foo.ts",
      line: 10,
      column: 5,
      type: "error",
      message: expect.stringContaining("Cannot find name")
    });
  });

  it("handles 'file:line: message' without column", () => {
    const stdout = "src/foo.py:42: SyntaxError: invalid syntax";
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/foo.py",
      line: 42,
      column: null,
      message: expect.stringContaining("invalid syntax")
    });
  });

  it("ignores lines that do not match any pattern", () => {
    const stdout = [
      "Running tests...",
      "src/foo.ts:10:5: Cannot find name 'foo'.",
      "Done in 1.2s."
    ].join("\n");
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("src/foo.ts");
  });

  it("relativizes absolute paths under project root", () => {
    const stdout = "/abs/project/src/foo.ts:10:5: Boom.";
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].file).toBe("src/foo.ts");
  });

  it("parses warning level when present", () => {
    const stdout = "src/foo.ts(10,5): warning TS6133: 'x' is declared but never used.";
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].type).toBe("warning");
  });

  it("includes context lines around the matched error", () => {
    const stdout = [
      "before line 1",
      "before line 2",
      "src/foo.ts:10:5: Cannot find name 'foo'.",
      "after line 1",
      "after line 2"
    ].join("\n");
    const out = parseGeneric({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].context).toBeDefined();
    expect(out[0].context).toContain("src/foo.ts:10:5");
    expect(out[0].context).toContain("before line 2");
    expect(out[0].context).toContain("after line 1");
  });

  it("merges errors from stdout and stderr", () => {
    const stdout = "src/a.ts:1:1: error A.";
    const stderr = "src/b.ts:2:2: error B.";
    const out = parseGeneric({ stdout, stderr, projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.file).sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
