import { describe, it, expect } from "vitest";
import { parseRubocop } from "../../src/parsers/rubocop.js";

const ROOT = "/workspace";

describe("parseRubocop", () => {
  it("returns [] for empty input", () => {
    expect(parseRubocop({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when no offenses", () => {
    const stdout = "3 files inspected, no offenses detected";
    expect(parseRubocop({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a convention offense", () => {
    const stdout = [
      "app/models/user.rb:5:3: C: Layout/IndentationWidth: Use 2 (not 4) spaces for indentation."
    ].join("\n");
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "app/models/user.rb",
      line: 5,
      column: 3,
      type: "warning",
      symbol: "Layout/IndentationWidth",
      message: "Use 2 (not 4) spaces for indentation."
    });
  });

  it("parses an error offense (E severity)", () => {
    const stdout = "app/models/user.rb:10:1: E: Security/Eval: The use of `eval` is a serious security risk.";
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].type).toBe("error");
  });

  it("parses a fatal offense (F severity)", () => {
    const stdout = "app/foo.rb:1:1: F: Lint/Syntax: unexpected token tIDENTIFIER";
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].type).toBe("error");
  });

  it("parses a warning offense (W severity)", () => {
    const stdout = "app/foo.rb:12:1: W: Rails/Output: Avoid using `puts`.";
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].type).toBe("warning");
  });

  it("parses multiple offenses", () => {
    const stdout = [
      "app/models/user.rb:5:3: C: Layout/IndentationWidth: Use 2 spaces.",
      "app/controllers/users_controller.rb:12:1: W: Rails/Output: Avoid puts."
    ].join("\n");
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("app/models/user.rb");
    expect(out[1].file).toBe("app/controllers/users_controller.rb");
  });

  it("handles [Correctable] prefix in message", () => {
    const stdout = "app/foo.rb:3:1: C: [Correctable] Style/FrozenStringLiteralComment: Missing magic comment.";
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toBe("Style/FrozenStringLiteralComment");
    expect(out[0].message).toContain("Missing magic comment");
  });

  it("relativizes absolute paths", () => {
    const stdout = "/workspace/app/foo.rb:1:1: W: Style/Foo: bad style.";
    const out = parseRubocop({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("app/foo.rb");
  });

  it("parses from stderr", () => {
    const stderr = "app/foo.rb:1:1: C: Style/Foo: bad style.";
    const out = parseRubocop({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
