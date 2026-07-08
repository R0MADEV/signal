import { describe, it, expect } from "vitest";
import { parseRspec } from "../../src/parsers/rspec.js";

const ROOT = "/workspace";

describe("parseRspec", () => {
  it("returns [] for empty input", () => {
    expect(parseRspec({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all examples pass", () => {
    const stdout = [
      "...",
      "",
      "3 examples, 0 failures"
    ].join("\n");
    expect(parseRspec({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a single failure with location", () => {
    const stdout = [
      "Failures:",
      "",
      "  1) User#full_name returns the full name",
      "     Failure/Error: expect(user.full_name).to eq('Alice Smith')",
      "",
      "       expected: \"Alice Smith\"",
      "            got: \"\"",
      "",
      "     # ./spec/models/user_spec.rb:15:in `block (3 levels) in <top (required)>'",
      "",
      "1 example, 1 failure"
    ].join("\n");
    const out = parseRspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "spec/models/user_spec.rb",
      line: 15,
      column: null,
      type: "error",
      symbol: "User#full_name returns the full name"
    });
  });

  it("captures the failure message", () => {
    const stdout = [
      "Failures:",
      "",
      "  1) MyClass does something",
      "     Failure/Error: expect(result).to be_truthy",
      "",
      "       expected nil to be truthy",
      "",
      "     # ./spec/my_class_spec.rb:10:in `block'",
      "",
      "1 example, 1 failure"
    ].join("\n");
    const out = parseRspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toContain("expected nil to be truthy");
  });

  it("parses multiple failures", () => {
    const stdout = [
      "Failures:",
      "",
      "  1) User#name returns name",
      "     Failure/Error: expect(x).to eq('foo')",
      "     # ./spec/models/user_spec.rb:5:in `block'",
      "",
      "  2) Order#total returns total",
      "     Failure/Error: expect(y).to eq(10)",
      "     # ./spec/models/order_spec.rb:8:in `block'",
      "",
      "2 examples, 2 failures"
    ].join("\n");
    const out = parseRspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("spec/models/user_spec.rb");
    expect(out[1].file).toBe("spec/models/order_spec.rb");
  });

  it("relativizes absolute paths", () => {
    const stdout = [
      "Failures:",
      "",
      "  1) Foo does bar",
      "     Failure/Error: expect(x).to eq(1)",
      "     # /workspace/spec/foo_spec.rb:3:in `block'",
      "",
      "1 example, 1 failure"
    ].join("\n");
    const out = parseRspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("spec/foo_spec.rb");
  });

  it("parses from stderr", () => {
    const stderr = [
      "Failures:",
      "",
      "  1) Foo does bar",
      "     Failure/Error: boom",
      "     # ./spec/foo_spec.rb:1:in `block'",
      "",
      "1 example, 1 failure"
    ].join("\n");
    const out = parseRspec({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
