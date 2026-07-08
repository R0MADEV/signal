import { describe, it, expect } from "vitest";
import { parsePytest } from "../../src/parsers/pytest.js";

const ROOT = "/workspace/backend";

describe("parsePytest", () => {
  it("returns [] for empty input", () => {
    expect(parsePytest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = "collected 3 items\n\n...\n\n3 passed in 0.12s";
    expect(parsePytest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a FAILED line into a ParsedError with symbol", () => {
    const stdout = [
      "FAILED tests/unit/test_auth.py::TestAuth::test_login - AssertionError: assert False"
    ].join("\n");
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/unit/test_auth.py",
      type: "error",
      symbol: "TestAuth::test_login",
      message: "AssertionError: assert False"
    });
  });

  it("parses FAILED line without class (module-level test)", () => {
    const stdout = "FAILED tests/test_foo.py::test_something - ValueError: bad value";
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "tests/test_foo.py",
      symbol: "test_something",
      message: "ValueError: bad value"
    });
  });

  it("extracts line number from FAILURES section", () => {
    const stdout = [
      "FAILED tests/unit/test_auth.py::TestAuth::test_login - AssertionError: assert False",
      "",
      "=========================== FAILURES ===========================",
      "__________________ TestAuth::test_login ___________________",
      "",
      "    def test_login():",
      ">       assert result == True",
      "E       AssertionError: assert False == True",
      "",
      "tests/unit/test_auth.py:42: AssertionError"
    ].join("\n");
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(42);
  });

  it("captures full assertion message from E lines", () => {
    const stdout = [
      "FAILED tests/test_foo.py::test_check - AssertionError: assert 1 == 2",
      "",
      "=========================== FAILURES ===========================",
      "__________________ test_check ___________________",
      "",
      ">       assert result == expected",
      "E       AssertionError: assert 1 == 2",
      "E       assert result == expected",
      "",
      "tests/test_foo.py:10: AssertionError"
    ].join("\n");
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("assert 1 == 2");
  });

  it("parses multiple failures", () => {
    const stdout = [
      "FAILED tests/test_a.py::test_one - AssertionError: nope",
      "FAILED tests/test_b.py::test_two - TypeError: wrong type"
    ].join("\n");
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("tests/test_a.py");
    expect(out[1].file).toBe("tests/test_b.py");
  });

  it("relativizes absolute paths", () => {
    const stdout = `FAILED /workspace/backend/tests/test_foo.py::test_x - AssertionError: nope`;
    const out = parsePytest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("tests/test_foo.py");
  });

  it("also parses from stderr", () => {
    const stderr = "FAILED tests/test_foo.py::test_x - RuntimeError: crash";
    const out = parsePytest({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
