import { describe, it, expect } from "vitest";
import { parseCargoClipy } from "../../src/parsers/cargo_clippy.js";

const ROOT = "/workspace/src-tauri";

describe("parseCargoClipy", () => {
  it("returns [] for empty input", () => {
    expect(parseCargoClipy({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when no errors or warnings", () => {
    const stderr = "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.12s";
    expect(parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT })).toEqual([]);
  });

  it("parses an error with error code", () => {
    const stderr = [
      "error[E0308]: mismatched types",
      "  --> src/main.rs:5:13",
      "   |",
      "5  |     let x: i32 = \"hello\";",
      "   |             ---   ^^^^^^^ expected `i32`, found `&str`"
    ].join("\n");
    const out = parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/main.rs",
      line: 5,
      column: 13,
      type: "error",
      symbol: "E0308",
      message: "mismatched types"
    });
  });

  it("parses a warning", () => {
    const stderr = [
      "warning: unused variable `x`",
      "  --> src/lib.rs:3:9"
    ].join("\n");
    const out = parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/lib.rs",
      line: 3,
      column: 9,
      type: "warning",
      message: "unused variable `x`"
    });
  });

  it("parses multiple diagnostics", () => {
    const stderr = [
      "error[E0308]: mismatched types",
      "  --> src/main.rs:5:13",
      "",
      "warning: unused import: `std::fmt`",
      "  --> src/lib.rs:1:5"
    ].join("\n");
    const out = parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe("error");
    expect(out[1].type).toBe("warning");
  });

  it("relativizes absolute paths", () => {
    const stderr = [
      "warning: unused variable",
      "  --> /workspace/src-tauri/src/main.rs:10:5"
    ].join("\n");
    const out = parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT });
    expect(out[0].file).toBe("src/main.rs");
  });

  it("parses from stdout too", () => {
    const stdout = [
      "error[E0502]: cannot borrow",
      "  --> src/db.rs:20:5"
    ].join("\n");
    const out = parseCargoClipy({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("skips aborting due to previous errors lines", () => {
    const stderr = [
      "error[E0308]: mismatched types",
      "  --> src/main.rs:5:13",
      "",
      "error: aborting due to previous error"
    ].join("\n");
    const out = parseCargoClipy({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });
});
