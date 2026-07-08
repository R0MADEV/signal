import { describe, it, expect } from "vitest";
import { parseGoTest } from "../../src/parsers/go_test.js";

const ROOT = "/usr/src/app";

describe("parseGoTest", () => {
  it("returns [] for empty input", () => {
    expect(parseGoTest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "ok  \tirontec.com/deitu/pkg/apis\t0.669s",
      "ok  \tirontec.com/deitu/pkg/backend\t0.004s"
    ].join("\n");
    expect(parseGoTest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a FAIL line with --- FAIL", () => {
    const stdout = [
      "=== RUN   TestSomething",
      "--- FAIL: TestSomething (0.01s)",
      "    user_test.go:42: expected true but got false",
      "FAIL\tirontec.com/deitu/pkg/user\t0.01s"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "error",
      symbol: "TestSomething",
      message: "expected true but got false"
    });
  });

  it("extracts file and line from message line", () => {
    const stdout = [
      "--- FAIL: TestMyFunc (0.00s)",
      "    auth_test.go:15: assertion failed"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0]).toMatchObject({
      file: "auth_test.go",
      line: 15
    });
  });

  it("parses multiple failures", () => {
    const stdout = [
      "--- FAIL: TestOne (0.00s)",
      "    a_test.go:5: error one",
      "--- FAIL: TestTwo (0.00s)",
      "    b_test.go:10: error two",
      "FAIL"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].symbol).toBe("TestOne");
    expect(out[1].symbol).toBe("TestTwo");
  });

  it("parses subtests with slash notation", () => {
    const stdout = [
      "--- FAIL: TestGroup/subcase (0.00s)",
      "    foo_test.go:20: subcase failed"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toBe("TestGroup/subcase");
  });

  it("captures multiline message from indented lines", () => {
    const stdout = [
      "--- FAIL: TestFoo (0.00s)",
      "    foo_test.go:7: first line",
      "        second line"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("first line");
  });

  it("parses from stderr", () => {
    const stderr = [
      "--- FAIL: TestBar (0.00s)",
      "    bar_test.go:3: boom"
    ].join("\n");
    const out = parseGoTest({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("handles panic output", () => {
    const stdout = [
      "panic: runtime error: index out of range [1] with length 1 [recovered]",
      "\tgoroutine 18 [running]:",
      "--- FAIL: TestPanic (0.00s)",
      "FAIL\tirontec.com/deitu/pkg/foo\t0.01s"
    ].join("\n");
    const out = parseGoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("TestPanic");
  });
});
