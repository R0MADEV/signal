import { describe, it, expect } from "vitest";
import { parseBehat } from "../../src/parsers/behat.js";

const ROOT = "/app";

describe("parseBehat", () => {
  it("returns [] for empty input", () => {
    expect(parseBehat({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] for a passing run", () => {
    const stdout = [
      "Feature: Login",
      "",
      "  Scenario: Successful login",
      "    Given I am on the login page",
      "    Then I should see Welcome",
      "",
      "1 scenario (1 passed)",
      "2 steps (2 passed)"
    ].join("\n");
    expect(parseBehat({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses 'Failed scenarios:' block", () => {
    const stdout = [
      "Feature: Login",
      "",
      "  Scenario: Successful login          # features/login.feature:5",
      "    Given ...",
      "    Then I should see Welcome",
      "      Failed asserting that 'Bye' contains 'Welcome'.",
      "",
      "--- Failed scenarios:",
      "",
      "    features/login.feature:5",
      "",
      "1 scenario (1 failed)",
      "3 steps (1 failed, 2 passed)"
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "features/login.feature",
      line: 5,
      column: null,
      type: "error"
    });
  });

  it("parses multiple failed scenarios", () => {
    const stdout = [
      "--- Failed scenarios:",
      "",
      "    features/login.feature:5",
      "    features/checkout.feature:42",
      "    features/signup.feature:18",
      "",
      "3 scenarios (3 failed)"
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.line)).toEqual([5, 42, 18]);
    expect(out.map((e) => e.file)).toEqual([
      "features/login.feature",
      "features/checkout.feature",
      "features/signup.feature"
    ]);
  });

  it("relativizes absolute feature paths under projectRoot", () => {
    const stdout = [
      "--- Failed scenarios:",
      "",
      "    /app/features/deep/nested/x.feature:7",
      "",
      "1 scenario (1 failed)"
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("features/deep/nested/x.feature");
  });

  it("captures the scenario title as symbol when available in the main output", () => {
    const stdout = [
      "  Scenario: Successful login          # features/login.feature:5",
      "    Then I see X",
      "      Failed asserting that 'foo' contains 'X'.",
      "",
      "--- Failed scenarios:",
      "",
      "    features/login.feature:5",
      ""
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toContain("Successful login");
  });

  it("falls back to file:line as symbol when scenario title not found", () => {
    const stdout = [
      "--- Failed scenarios:",
      "",
      "    features/login.feature:5",
      ""
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toBe("features/login.feature:5");
  });

  it("captures the exception type at the end of a failing scenario block as the message", () => {
    const stdout = [
      "  Scenario: Retrieve the clients json list                          # features/aps/client/getClient.feature:7",
      "    Given I add Authorization header                                # FeatureContext::setAuthorizationHeader()",
      "    When I add Accept header                                        # RestContext::iAddHeader()",
      "    And I send a GET request to clients                             # RestContext::iSendARequestTo()",
      "    Then the response status code should be 200                     # MinkContext::assertResponseStatus()",
      "    And the JSON should be equal to:                                # JsonContext::theJsonShouldBeEqualTo()",
      '      """',
      "      [",
      "        { stuff }",
      "      ]",
      "      ] (Behat\\Mink\\Exception\\ExpectationException)",
      "",
      "  Scenario: Another                                                 # features/aps/other.feature:5",
      "    Given x",
      "",
      "--- Failed scenarios:",
      "",
      "    features/aps/client/getClient.feature:7",
      "",
      "1 scenario (1 failed)"
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("ExpectationException");
    expect(out[0].symbol).toBe("Retrieve the clients json list");
  });

  it("ignores text after scenarios section", () => {
    const stdout = [
      "--- Failed scenarios:",
      "",
      "    features/x.feature:1",
      "",
      "1 scenario (1 failed)",
      "2 steps (1 failed, 1 passed)",
      "0m1.23s (15.00Mb)"
    ].join("\n");
    const out = parseBehat({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
