import { describe, it, expect } from "vitest";
import { parsePlaywright } from "../../src/parsers/playwright.js";

const ROOT = "/workspace";

describe("parsePlaywright", () => {
  it("returns [] for empty input", () => {
    expect(parsePlaywright({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "Running 3 tests using 2 workers",
      "  ✓  1 [chromium] › auth/login.spec.ts:12:5 › Login › redirect (1.2s)",
      "  3 passed"
    ].join("\n");
    expect(parsePlaywright({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a failing test with location from failure block", () => {
    const stdout = [
      "  ✗  1 [chromium] › auth/login.spec.ts:25:5 › Login › should show error",
      "",
      "  1) [chromium] › auth/login.spec.ts:25:5 › Login › should show error ───",
      "",
      "    Error: expect(received).toContain(expected)",
      "",
      "      at /workspace/auth/login.spec.ts:25:38"
    ].join("\n");
    const out = parsePlaywright({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "auth/login.spec.ts",
      line: 25,
      column: 38,
      type: "error",
      symbol: "Login › should show error"
    });
  });

  it("captures the error message", () => {
    const stdout = [
      "  1) [chromium] › auth/login.spec.ts:10:5 › my test ───",
      "    Error: Locator expected to be visible",
      "      at /workspace/auth/login.spec.ts:10:5"
    ].join("\n");
    const out = parsePlaywright({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("Locator expected to be visible");
  });

  it("parses multiple failures across browsers and files", () => {
    const stdout = [
      "  1) [chromium] › auth/login.spec.ts:25:5 › Login › wrong password ───",
      "    Error: boom",
      "      at /workspace/auth/login.spec.ts:25:38",
      "",
      "  2) [firefox] › user/profile.spec.ts:8:5 › Profile › username ───",
      "    Error: crash",
      "      at /workspace/user/profile.spec.ts:8:42"
    ].join("\n");
    const out = parsePlaywright({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("auth/login.spec.ts");
    expect(out[1].file).toBe("user/profile.spec.ts");
  });

  it("uses file:line from failure header when no at-line found", () => {
    const stdout = [
      "  1) [chromium] › auth/login.spec.ts:25:5 › Login › test ───",
      "    Error: something failed"
    ].join("\n");
    const out = parsePlaywright({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("auth/login.spec.ts");
    expect(out[0].line).toBe(25);
    expect(out[0].column).toBe(5);
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "  1) [chromium] › /workspace/auth/login.spec.ts:10:5 › test ───",
      "    Error: boom",
      "      at /workspace/auth/login.spec.ts:10:5"
    ].join("\n");
    const out = parsePlaywright({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("auth/login.spec.ts");
  });

  it("parses from stderr", () => {
    const stderr = [
      "  1) [chromium] › auth/login.spec.ts:5:5 › test ───",
      "    Error: boom",
      "      at /workspace/auth/login.spec.ts:5:1"
    ].join("\n");
    const out = parsePlaywright({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
