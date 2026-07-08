import { describe, it, expect } from "vitest";
import { parsePhpstan } from "../../src/parsers/phpstan.js";

const PROJECT_ROOT = "/abs/project";

describe("parsePhpstan", () => {
  it("returns [] for empty result", () => {
    const stdout = JSON.stringify({
      totals: { errors: 0, file_errors: 0 },
      files: {},
      errors: []
    });
    expect(parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT })).toEqual([]);
  });

  it("flattens file errors into ParsedError list", () => {
    const stdout = JSON.stringify({
      totals: { errors: 0, file_errors: 3 },
      files: {
        "/abs/project/src/User/Handler.php": {
          errors: 2,
          messages: [
            { message: "Call to an undefined method UserId::fromString().", line: 42 },
            { message: "Method must return UserId.", line: 50 }
          ]
        },
        "/abs/project/src/Order/Repo.php": {
          errors: 1,
          messages: [{ message: "Undefined variable: $foo.", line: 10 }]
        }
      },
      errors: []
    });
    const out = parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      file: "src/User/Handler.php",
      line: 42,
      column: null,
      type: "error",
      message: "Call to an undefined method UserId::fromString()."
    });
    expect(out.map((e) => e.file)).toEqual([
      "src/User/Handler.php",
      "src/User/Handler.php",
      "src/Order/Repo.php"
    ]);
  });

  it("relativizes absolute paths under project root", () => {
    const stdout = JSON.stringify({
      totals: { errors: 0, file_errors: 1 },
      files: {
        "/abs/project/app/Service.php": {
          errors: 1,
          messages: [{ message: "Boom.", line: 1 }]
        }
      },
      errors: []
    });
    const out = parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].file).toBe("app/Service.php");
  });

  it("leaves paths outside project root absolute", () => {
    const stdout = JSON.stringify({
      totals: { errors: 0, file_errors: 1 },
      files: {
        "/elsewhere/Service.php": {
          errors: 1,
          messages: [{ message: "Boom.", line: 1 }]
        }
      },
      errors: []
    });
    const out = parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].file).toBe("/elsewhere/Service.php");
  });

  it("captures generic top-level errors with no file", () => {
    const stdout = JSON.stringify({
      totals: { errors: 1, file_errors: 0 },
      files: {},
      errors: ["Configuration is invalid: missing parameter X"]
    });
    const out = parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "<global>",
      line: null,
      column: null,
      type: "error",
      message: "Configuration is invalid: missing parameter X"
    });
  });

  it("throws on malformed JSON with a clear message", () => {
    expect(() =>
      parsePhpstan({ stdout: "not json", stderr: "", projectRoot: PROJECT_ROOT })
    ).toThrow(/phpstan.*JSON/i);
  });

  it("throws on JSON missing required shape", () => {
    expect(() =>
      parsePhpstan({ stdout: JSON.stringify({ wrong: true }), stderr: "", projectRoot: PROJECT_ROOT })
    ).toThrow();
  });

  it("extracts symbol from 'undefined method X::Y' messages when present", () => {
    const stdout = JSON.stringify({
      totals: { errors: 0, file_errors: 1 },
      files: {
        "/abs/project/a.php": {
          errors: 1,
          messages: [{ message: "Call to an undefined method UserId::fromString().", line: 1 }]
        }
      },
      errors: []
    });
    const out = parsePhpstan({ stdout, stderr: "", projectRoot: PROJECT_ROOT });
    expect(out[0].symbol).toBe("UserId::fromString");
  });
});
