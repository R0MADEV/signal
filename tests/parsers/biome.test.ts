import { describe, it, expect } from "vitest";
import { parseBiome } from "../../src/parsers/biome.js";

const ROOT = "/workspace/frontend";

function makeOutput(diagnostics: object[], errors = diagnostics.length): string {
  return JSON.stringify({
    summary: { changed: 0, unchanged: 1, errors, warnings: 0 },
    diagnostics
  });
}

describe("parseBiome", () => {
  it("returns [] for empty input", () => {
    expect(parseBiome({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when no diagnostics", () => {
    const stdout = makeOutput([]);
    expect(parseBiome({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a lint error with location", () => {
    const stdout = makeOutput([
      {
        category: "lint/correctness/noUnusedVariables",
        severity: "error",
        description: "'x' is defined here",
        message: "This variable is unused.",
        location: {
          path: { file: "src/components/Foo.tsx" },
          span: { start: { line: 10, column: 5 } }
        }
      }
    ]);
    const out = parseBiome({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/components/Foo.tsx",
      line: 10,
      column: 5,
      type: "error",
      message: "This variable is unused.",
      symbol: "lint/correctness/noUnusedVariables"
    });
  });

  it("parses a warning with severity warning", () => {
    const stdout = makeOutput([
      {
        category: "lint/style/useConst",
        severity: "warning",
        description: "Use const instead of let",
        message: "Prefer const",
        location: {
          path: { file: "src/foo.ts" },
          span: { start: { line: 3, column: 1 } }
        }
      }
    ]);
    const out = parseBiome({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].type).toBe("warning");
  });

  it("parses multiple diagnostics", () => {
    const stdout = makeOutput([
      {
        category: "lint/a",
        severity: "error",
        description: "error A",
        message: "msg A",
        location: { path: { file: "a.ts" }, span: { start: { line: 1, column: 1 } } }
      },
      {
        category: "lint/b",
        severity: "error",
        description: "error B",
        message: "msg B",
        location: { path: { file: "b.ts" }, span: { start: { line: 2, column: 2 } } }
      }
    ]);
    const out = parseBiome({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
  });

  it("skips diagnostics without location", () => {
    const stdout = makeOutput([
      {
        category: "lint/x",
        severity: "error",
        description: "no location",
        message: "msg"
      }
    ]);
    const out = parseBiome({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(0);
  });

  it("relativizes absolute paths", () => {
    const stdout = makeOutput([
      {
        category: "lint/a",
        severity: "error",
        description: "err",
        message: "msg",
        location: {
          path: { file: "/workspace/frontend/src/foo.ts" },
          span: { start: { line: 1, column: 1 } }
        }
      }
    ]);
    const out = parseBiome({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("src/foo.ts");
  });

  it("returns [] for non-JSON output", () => {
    const stdout = "biome check failed with exit code 1";
    expect(parseBiome({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });
});
