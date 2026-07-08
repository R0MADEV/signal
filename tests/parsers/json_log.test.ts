import { describe, it, expect } from "vitest";
import { parseJsonLog } from "../../src/parsers/json_log.js";

const ROOT = "/workspace";

function line(obj: object): string {
  return JSON.stringify(obj);
}

describe("parseJsonLog", () => {
  it("returns [] for empty input", () => {
    expect(parseJsonLog({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a basic ERROR log line", () => {
    const stdout = line({ level: "ERROR", message: "Database connection failed", file: "db/connection.py", line: 42 });
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "error",
      message: "Database connection failed",
      file: "db/connection.py",
      line: 42
    });
  });

  it("normalizes level variants: ERROR, error, CRITICAL", () => {
    const stdout = [
      line({ level: "error", msg: "lowercase error" }),
      line({ severity: "CRITICAL", message: "critical" }),
      line({ loglevel: "FATAL", message: "fatal" })
    ].join("\n");
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(3);
    expect(out.every(e => e.type === "error")).toBe(true);
  });

  it("captures WARNING as type warning", () => {
    const stdout = line({ level: "WARNING", message: "Retry attempt", file: "db.py", line: 10 });
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].type).toBe("warning");
  });

  it("supports msg field as alias for message", () => {
    const stdout = line({ level: "ERROR", msg: "Something broke" });
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].message).toBe("Something broke");
  });

  it("supports lineno and line_number field aliases", () => {
    const stdout = [
      line({ level: "ERROR", message: "a", file: "a.py", lineno: 10 }),
      line({ level: "ERROR", message: "b", file: "b.py", line_number: 20 })
    ].join("\n");
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].line).toBe(10);
    expect(out[1].line).toBe(20);
  });

  it("supports filename and module as file aliases", () => {
    const stdout = [
      line({ level: "ERROR", message: "a", filename: "foo.py" }),
      line({ level: "ERROR", message: "b", module: "bar" })
    ].join("\n");
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("foo.py");
    expect(out[1].file).toBe("bar");
  });

  it("skips INFO and DEBUG lines", () => {
    const stdout = [
      line({ level: "INFO", message: "Server started" }),
      line({ level: "DEBUG", message: "Processing request" }),
      line({ level: "ERROR", message: "Crash" })
    ].join("\n");
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("skips non-JSON lines gracefully", () => {
    const stdout = [
      "plain text line",
      line({ level: "ERROR", message: "real error" }),
      "{invalid json"
    ].join("\n");
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("parses from stderr too", () => {
    const stderr = line({ level: "ERROR", message: "from stderr" });
    const out = parseJsonLog({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("uses <unknown> file when no file field present", () => {
    const stdout = line({ level: "ERROR", message: "no file info" });
    const out = parseJsonLog({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe("<unknown>");
  });
});
