import { describe, it, expect } from "vitest";
import { parseJunit } from "../../src/parsers/junit.js";

const ROOT = "/app";

describe("parseJunit", () => {
  it("returns [] for empty input", () => {
    expect(parseJunit({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] for a passing testsuite (no failures, no errors)", () => {
    const stdout = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="MyTest" tests="2" failures="0" errors="0" time="0.05">
    <testcase name="testOk1" classname="MyTest" file="tests/MyTest.php" line="10" time="0.01"/>
    <testcase name="testOk2" classname="MyTest" file="tests/MyTest.php" line="20" time="0.04"/>
  </testsuite>
</testsuites>`;
    expect(parseJunit({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single failure with message and file:line attributes", () => {
    const stdout = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="MyTest" tests="1" failures="1">
    <testcase name="testFails" classname="App\\Tests\\MyTest" file="/app/tests/MyTest.php" line="42" time="0.01">
      <failure message="Failed asserting that 2 matches expected 0." type="PHPUnit\\Framework\\ExpectationFailedException">Failed asserting that 2 matches expected 0.

/app/tests/MyTest.php:42</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/MyTest.php",
      line: 42,
      column: null,
      type: "error",
      message: expect.stringContaining("Failed asserting that 2 matches expected 0"),
      symbol: "App\\Tests\\MyTest::testFails"
    });
  });

  it("parses errors (separate tag from failure)", () => {
    const stdout = `<testsuites>
  <testsuite name="X">
    <testcase name="testCrash" classname="X" file="tests/X.php" line="7">
      <error message="TypeError: argument" type="TypeError">Stack trace</error>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/X.php",
      line: 7,
      message: expect.stringContaining("TypeError"),
      symbol: "X::testCrash"
    });
  });

  it("parses multiple failures across testcases", () => {
    const stdout = `<testsuites>
  <testsuite name="S">
    <testcase name="a" classname="A" file="tests/A.php" line="1">
      <failure message="msg a" type="T">d</failure>
    </testcase>
    <testcase name="b" classname="B" file="tests/B.php" line="2"/>
    <testcase name="c" classname="C" file="tests/C.php" line="3">
      <failure message="msg c" type="T">d</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.symbol).sort()).toEqual(["A::a", "C::c"]);
  });

  it("uses 'tests/X.php:42' fallback when file/line attributes are missing", () => {
    const stdout = `<testsuites>
  <testsuite name="S">
    <testcase name="bare" classname="X">
      <failure message="some failure" type="T">/app/path/to/file.php:99
something more</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "path/to/file.php",
      line: 99,
      symbol: "X::bare"
    });
  });

  it("relativizes absolute paths under projectRoot", () => {
    const stdout = `<testsuites>
  <testsuite name="S">
    <testcase name="t" classname="X" file="/app/deep/Test.php" line="5">
      <failure message="m" type="T">d</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("deep/Test.php");
  });

  it("ignores non-XML noise before/after the document", () => {
    const stdout = `PHPUnit 10.5.15
Testing...

<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="S">
    <testcase name="t" classname="X" file="tests/X.php" line="5">
      <failure message="m" type="T">d</failure>
    </testcase>
  </testsuite>
</testsuites>

Done in 1.2s.`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("decodes basic XML entities in messages", () => {
    const stdout = `<testsuites>
  <testsuite name="S">
    <testcase name="t" classname="X" file="x.php" line="1">
      <failure message="expected &lt;a&gt; but got &lt;b&gt; &amp; more" type="T">d</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("<a>");
    expect(out[0].message).toContain("<b>");
    expect(out[0].message).toContain("&");
  });

  it("handles nested testsuites (Behat-style with one suite per feature)", () => {
    const stdout = `<testsuites>
  <testsuite name="all">
    <testsuite name="login">
      <testcase name="loginFails" classname="login" file="features/login.feature" line="5">
        <failure message="status mismatch" type="ExpectationException">d</failure>
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;
    const out = parseJunit({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "features/login.feature",
      line: 5,
      symbol: "login::loginFails"
    });
  });
});
