import { describe, it, expect } from "vitest";
import { parsePhpunit } from "../../src/parsers/phpunit.js";

const ROOT = "/app";

describe("parsePhpunit", () => {
  it("returns [] for empty input", () => {
    expect(parsePhpunit({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] for a passing run", () => {
    const stdout = [
      "PHPUnit 10.5.15 by Sebastian Bergmann and contributors.",
      "",
      "............................                                  28 / 28 (100%)",
      "",
      "Time: 00:00.123, Memory: 14.00 MB",
      "",
      "OK (28 tests, 30 assertions)"
    ].join("\n");
    expect(parsePhpunit({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single failure with file:line", () => {
    const stdout = [
      "PHPUnit 10.5.15 by Sebastian Bergmann and contributors.",
      "",
      "...F.........                                                 13 / 13 (100%)",
      "",
      "There was 1 failure:",
      "",
      "1) Tests\\UnitTest::testSomething",
      "Failed asserting that false is true.",
      "",
      "/app/tests/UnitTest.php:42",
      "",
      "FAILURES!",
      "Tests: 13, Assertions: 14, Failures: 1."
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/UnitTest.php",
      line: 42,
      column: null,
      type: "error",
      message: expect.stringContaining("Failed asserting that false is true"),
      symbol: "Tests\\UnitTest::testSomething"
    });
  });

  it("parses multiple failures across files", () => {
    const stdout = [
      "There were 2 failures:",
      "",
      "1) Tests\\AaaTest::testA",
      "Some failure message",
      "",
      "/app/tests/AaaTest.php:10",
      "",
      "2) Tests\\BbbTest::testB",
      "Another failure",
      "",
      "/app/tests/BbbTest.php:20",
      "",
      "FAILURES!"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      file: "tests/AaaTest.php",
      line: 10,
      symbol: "Tests\\AaaTest::testA"
    });
    expect(out[1]).toMatchObject({
      file: "tests/BbbTest.php",
      line: 20,
      symbol: "Tests\\BbbTest::testB"
    });
  });

  it("parses errors (separate from failures)", () => {
    const stdout = [
      "There was 1 error:",
      "",
      "1) Tests\\BoomTest::testCrash",
      "TypeError: Argument 1 passed to foo()",
      "",
      "/app/tests/BoomTest.php:15",
      "",
      "ERRORS!"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("error");
    expect(out[0].message).toContain("TypeError");
  });

  it("handles failures and errors mixed in the same run", () => {
    const stdout = [
      "There were 2 failures:",
      "",
      "1) FailTest::testA",
      "Failed asserting X",
      "",
      "/app/tests/FailTest.php:5",
      "",
      "2) FailTest::testB",
      "Failed asserting Y",
      "",
      "/app/tests/FailTest.php:10",
      "",
      "--",
      "",
      "There was 1 error:",
      "",
      "1) ErrTest::testC",
      "Exception thrown",
      "",
      "/app/tests/ErrTest.php:7",
      "",
      "FAILURES!"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.symbol).sort()).toEqual([
      "ErrTest::testC",
      "FailTest::testA",
      "FailTest::testB"
    ]);
  });

  it("captures multi-line messages by joining the first paragraph", () => {
    const stdout = [
      "There was 1 failure:",
      "",
      "1) UnitTest::testMulti",
      "Failed asserting that two strings are equal.",
      "--- Expected",
      "+++ Actual",
      "@@ @@",
      "-'foo'",
      "+'bar'",
      "",
      "/app/tests/UnitTest.php:99"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain("Failed asserting that two strings are equal");
    expect(out[0].line).toBe(99);
  });

  it("falls back to null line when no file:line line is present", () => {
    const stdout = [
      "There was 1 failure:",
      "",
      "1) Some\\Class::method",
      "Some opaque error with no source position",
      "",
      "FAILURES!"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      line: null,
      column: null,
      message: expect.stringContaining("opaque error")
    });
  });

  it("relativizes absolute paths under projectRoot", () => {
    const stdout = [
      "There was 1 failure:",
      "",
      "1) X::y",
      "msg",
      "",
      "/app/deep/nested/X.php:1"
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("deep/nested/X.php");
  });

  it("ignores noise lines outside the failure/error blocks", () => {
    const stdout = [
      "PHPUnit 10.5.15",
      "",
      "Configuration: /app/phpunit.xml.dist",
      "",
      "..F",
      "",
      "There was 1 failure:",
      "",
      "1) X::y",
      "msg",
      "",
      "/app/X.php:1",
      "",
      "FAILURES!",
      "Tests: 3, Assertions: 3, Failures: 1."
    ].join("\n");
    const out = parsePhpunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
