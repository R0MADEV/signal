import { describe, it, expect } from "vitest";
import { parseMocha } from "../../src/parsers/mocha.js";

const ROOT = "/workspace";

describe("parseMocha", () => {
  it("returns [] for empty input", () => {
    expect(parseMocha({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "  Auth",
      "    ✓ should login (12ms)",
      "    ✓ should logout",
      "",
      "  2 passing (20ms)"
    ].join("\n");
    expect(parseMocha({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single failure with location", () => {
    const stdout = [
      "  2 failing",
      "",
      "  1) Auth login should return a token:",
      "     AssertionError: expected undefined to equal 'abc123'",
      "      at Context.<anonymous> (test/auth.test.js:15:20)"
    ].join("\n");
    const out = parseMocha({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "test/auth.test.js",
      line: 15,
      column: 20,
      type: "error",
      symbol: "Auth login should return a token"
    });
  });

  it("captures the error message", () => {
    const stdout = [
      "  1 failing",
      "",
      "  1) My Suite my test:",
      "     Error: timeout of 2000ms exceeded",
      "      at Context.<anonymous> (test/foo.test.js:30:5)"
    ].join("\n");
    const out = parseMocha({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("timeout of 2000ms exceeded");
  });

  it("parses multiple failures", () => {
    const stdout = [
      "  2 failing",
      "",
      "  1) Auth login should return a token:",
      "     AssertionError: expected undefined to equal 'abc123'",
      "      at Context.<anonymous> (test/auth.test.js:15:20)",
      "",
      "  2) User should return the user profile:",
      "     Error: timeout exceeded",
      "      at Context.<anonymous> (test/user.test.js:30:5)"
    ].join("\n");
    const out = parseMocha({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("test/auth.test.js");
    expect(out[1].file).toBe("test/user.test.js");
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "  1 failing",
      "",
      "  1) Foo bar:",
      "     Error: boom",
      "      at Context.<anonymous> (/workspace/test/foo.test.js:5:1)"
    ].join("\n");
    const out = parseMocha({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("test/foo.test.js");
  });

  it("falls back to no location when no at-line found", () => {
    const stdout = [
      "  1 failing",
      "",
      "  1) Foo bar:",
      "     Error: something broke"
    ].join("\n");
    const out = parseMocha({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].line).toBeNull();
    expect(out[0].symbol).toBe("Foo bar");
  });

  it("parses from stderr", () => {
    const stderr = [
      "  1 failing",
      "",
      "  1) Foo bar:",
      "     Error: boom",
      "      at Context.<anonymous> (test/foo.test.js:3:1)"
    ].join("\n");
    const out = parseMocha({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
