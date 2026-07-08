import { describe, it, expect } from "vitest";
import { groupErrors } from "../src/grouper.js";
import type { ParsedError } from "../src/parsers/index.js";

const err = (overrides: Partial<ParsedError>): ParsedError => ({
  file: "src/a.ts",
  line: 1,
  column: null,
  type: "error",
  message: "default message",
  ...overrides
});

describe("groupErrors", () => {
  it("returns [] for empty input", () => {
    expect(groupErrors([])).toEqual([]);
  });

  it("passes context through to the first occurrence", () => {
    const errors = [err({ context: "line before\nthe error line\nline after" })];
    const groups = groupErrors(errors);
    expect(groups[0].occurrences[0].context).toBe("line before\nthe error line\nline after");
  });

  it("omits context when not present in ParsedError", () => {
    const errors = [err({})];
    const groups = groupErrors(errors);
    expect(groups[0].occurrences[0].context).toBeUndefined();
  });

  it("groups errors with the same symbol regardless of file", () => {
    const errors = [
      err({
        symbol: "UserId::fromString",
        message: "Call to undefined method UserId::fromString().",
        file: "src/a.ts"
      }),
      err({
        symbol: "UserId::fromString",
        message: "Call to undefined method UserId::fromString().",
        file: "src/b.ts"
      })
    ];
    const groups = groupErrors(errors);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].symbol).toBe("UserId::fromString");
    expect(groups[0].files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("normalizes numeric values so messages with different numbers group together", () => {
    const errors = [
      err({ message: "Variable x must be at least 5", file: "src/a.ts", line: 1 }),
      err({ message: "Variable x must be at least 100", file: "src/a.ts", line: 5 })
    ];
    const groups = groupErrors(errors);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("normalizes absolute paths so messages with different paths group together", () => {
    const errors = [
      err({ message: "Cannot open /tmp/foo.lock", file: "src/a.ts" }),
      err({ message: "Cannot open /var/run/bar.lock", file: "src/a.ts" })
    ];
    const groups = groupErrors(errors);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("keeps unrelated messages in separate groups", () => {
    const errors = [
      err({ message: "Cannot find name 'foo'." }),
      err({ message: "Cannot read property 'x' of undefined" })
    ];
    const groups = groupErrors(errors);
    expect(groups).toHaveLength(2);
  });

  it("dedupes file names within a group while keeping all occurrences", () => {
    const errors = [
      err({ symbol: "X::y", message: "m", file: "a.ts", line: 1 }),
      err({ symbol: "X::y", message: "m", file: "a.ts", line: 2 }),
      err({ symbol: "X::y", message: "m", file: "b.ts", line: 1 })
    ];
    const groups = groupErrors(errors);
    expect(groups[0].count).toBe(3);
    expect(groups[0].files.sort()).toEqual(["a.ts", "b.ts"]);
    expect(groups[0].occurrences).toHaveLength(3);
  });

  it("sorts groups by count descending", () => {
    const errors = [
      err({ symbol: "rare::m", message: "m1" }),
      err({ symbol: "common::m", message: "m2" }),
      err({ symbol: "common::m", message: "m2" }),
      err({ symbol: "common::m", message: "m2" })
    ];
    const groups = groupErrors(errors);
    expect(groups[0].symbol).toBe("common::m");
    expect(groups[0].count).toBe(3);
    expect(groups[1].symbol).toBe("rare::m");
  });

  it("preserves occurrence file/line/column", () => {
    const errors = [
      err({ symbol: "X::y", file: "a.ts", line: 10, column: 5 }),
      err({ symbol: "X::y", file: "b.ts", line: 20, column: null })
    ];
    const groups = groupErrors(errors);
    expect(groups[0].occurrences).toEqual([
      { file: "a.ts", line: 10, column: 5 },
      { file: "b.ts", line: 20, column: null }
    ]);
  });

  it("separates groups by error type", () => {
    const errors = [
      err({ type: "error", message: "same" }),
      err({ type: "warning", message: "same" })
    ];
    const groups = groupErrors(errors);
    expect(groups).toHaveLength(2);
  });

  it("produces stable fingerprints across runs", () => {
    const e = err({ symbol: "X::y", message: "m" });
    const a = groupErrors([e])[0].fingerprint;
    const b = groupErrors([e])[0].fingerprint;
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{12}$/);
  });
});
