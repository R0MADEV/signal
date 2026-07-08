import { describe, it, expect } from "vitest";
import { parseEslint } from "../../src/parsers/eslint.js";

const ROOT = "/proj";

describe("parseEslint", () => {
  it("returns [] for empty input", () => {
    expect(parseEslint({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single file with one warning", () => {
    const stdout = [
      "/proj/src/foo.ts",
      "  12:13  warning  'tag' is unused  @typescript-eslint/no-unused-vars",
      "",
      "✖ 1 problem (0 errors, 1 warning)"
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/foo.ts",
      line: 12,
      column: 13,
      type: "warning",
      message: "'tag' is unused",
      symbol: "@typescript-eslint/no-unused-vars"
    });
  });

  it("parses multiple files with mixed errors and warnings", () => {
    const stdout = [
      "/proj/src/a.ts",
      "  10:5  error  Foo error  rule-one",
      "  20:1  warning  Bar warn  rule-two",
      "",
      "/proj/src/b.ts",
      "  3:1  error  Boom  rule-three",
      ""
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ file: "src/a.ts", type: "error", symbol: "rule-one" });
    expect(out[1]).toMatchObject({ file: "src/a.ts", type: "warning", symbol: "rule-two" });
    expect(out[2]).toMatchObject({ file: "src/b.ts", type: "error", symbol: "rule-three" });
  });

  it("skips the summary footer", () => {
    const stdout = [
      "/proj/a.ts",
      "  1:1  error  X  r1",
      "",
      "✖ 1 problem (1 error, 0 warnings)"
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("ignores noise lines that don't look like file paths or entries", () => {
    const stdout = [
      "yarn run v1.22.19",
      "$ eslint .",
      "",
      "/proj/a.ts",
      "  1:1  error  X  r1",
      "",
      "Done in 1.2s."
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("groups by rule id (used as symbol)", () => {
    const stdout = [
      "/proj/a.ts",
      "  1:1  warning  Foo  unused",
      "",
      "/proj/b.ts",
      "  2:2  warning  Bar  unused",
      ""
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out.every((e) => e.symbol === "unused")).toBe(true);
  });

  it("handles 0:0 parsing errors", () => {
    const stdout = [
      "/proj/broken.ts",
      "  0:0  error  Parsing error: Unexpected token  parser-error"
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(0);
    expect(out[0].column).toBe(0);
  });

  it("relativizes absolute paths under projectRoot", () => {
    const stdout = ["/proj/deep/nested/file.tsx", "  1:1  error  X  r"].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("deep/nested/file.tsx");
  });

  it("recognizes common JS/TS extensions", () => {
    const stdout = [
      "/proj/a.tsx",
      "  1:1  error  X  r1",
      "",
      "/proj/b.jsx",
      "  1:1  error  X  r2",
      "",
      "/proj/c.mjs",
      "  1:1  error  X  r3",
      "",
      "/proj/d.scss",
      "  1:1  error  X  r4",
      ""
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out.map((e) => e.file).sort()).toEqual(["a.tsx", "b.jsx", "c.mjs", "d.scss"]);
  });

  it("does not pick up lines that look like sentences with a period", () => {
    const stdout = [
      "Done in 1.2s.",
      "Some narrative line.",
      "/proj/a.ts",
      "  1:1  error  X  r"
    ].join("\n");
    const out = parseEslint({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("a.ts");
  });
});
