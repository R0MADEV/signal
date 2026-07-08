import { describe, it, expect } from "vitest";
import { parseCypress } from "../../src/parsers/cypress.js";

const ROOT = "/workspace";

describe("parseCypress", () => {
  it("returns [] for empty input", () => {
    expect(parseCypress({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all specs pass", () => {
    const stdout = [
      "  (Run Finished)",
      "  Spec                    Tests  Passing  Failing",
      "  login.cy.ts             3      3        0"
    ].join("\n");
    expect(parseCypress({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a failing test with spec file", () => {
    const stdout = [
      "  (Running: cypress/e2e/login.cy.ts)",
      "",
      "  1) Login › should redirect after login",
      "",
      "  1 failing",
      "",
      "  1) Login › should redirect after login:",
      "       AssertionError: expected '/dashboard' to equal '/home'",
      "      at Context.<anonymous> (cypress/e2e/login.cy.ts:25:7)"
    ].join("\n");
    const out = parseCypress({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "cypress/e2e/login.cy.ts",
      line: 25,
      column: 7,
      type: "error",
      symbol: "Login › should redirect after login"
    });
  });

  it("captures the assertion message", () => {
    const stdout = [
      "  (Running: cypress/e2e/foo.cy.ts)",
      "  1) my test:",
      "       AssertionError: expected true to equal false",
      "      at Context.<anonymous> (cypress/e2e/foo.cy.ts:10:3)"
    ].join("\n");
    const out = parseCypress({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("AssertionError");
  });

  it("parses multiple failures across specs", () => {
    const stdout = [
      "  (Running: cypress/e2e/a.cy.ts)",
      "  1) test one:",
      "       Error: boom",
      "      at Context.<anonymous> (cypress/e2e/a.cy.ts:1:1)",
      "",
      "  (Running: cypress/e2e/b.cy.ts)",
      "  1) test two:",
      "       Error: crash",
      "      at Context.<anonymous> (cypress/e2e/b.cy.ts:2:2)"
    ].join("\n");
    const out = parseCypress({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("cypress/e2e/a.cy.ts");
    expect(out[1].file).toBe("cypress/e2e/b.cy.ts");
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "  (Running: /workspace/cypress/e2e/foo.cy.ts)",
      "  1) my test:",
      "       Error: boom",
      "      at Context.<anonymous> (/workspace/cypress/e2e/foo.cy.ts:5:1)"
    ].join("\n");
    const out = parseCypress({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("cypress/e2e/foo.cy.ts");
  });

  it("parses from stderr", () => {
    const stderr = [
      "  (Running: cypress/e2e/foo.cy.ts)",
      "  1) my test:",
      "       Error: boom",
      "      at Context.<anonymous> (cypress/e2e/foo.cy.ts:3:1)"
    ].join("\n");
    const out = parseCypress({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("falls back to spec file when no at-line found", () => {
    const stdout = [
      "  (Running: cypress/e2e/foo.cy.ts)",
      "  1) broken test:",
      "       Error: something failed"
    ].join("\n");
    const out = parseCypress({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("cypress/e2e/foo.cy.ts");
    expect(out[0].line).toBeNull();
  });
});
