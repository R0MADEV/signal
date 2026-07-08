import { describe, it, expect } from "vitest";
import { parseCargoTest } from "../../src/parsers/cargo_test.js";

const ROOT = "/workspace/src-tauri";

describe("parseCargoTest", () => {
  it("returns [] for empty input", () => {
    expect(parseCargoTest({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all tests pass", () => {
    const stdout = [
      "running 3 tests",
      "test vault::tests::encrypt_decrypt_roundtrip ... ok",
      "test db::tests::is_safe_ident ... ok",
      "test result: ok. 3 passed; 0 failed"
    ].join("\n");
    expect(parseCargoTest({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses a panicked test with file and line", () => {
    const stdout = [
      "running 1 test",
      "test vault::tests::wrong_key_fails_decryption ... FAILED",
      "",
      "failures:",
      "",
      "---- vault::tests::wrong_key_fails_decryption stdout ----",
      "thread 'vault::tests::wrong_key_fails_decryption' panicked at 'assertion failed: result.is_err()', src/vault.rs:142:9",
      "",
      "failures:",
      "    vault::tests::wrong_key_fails_decryption",
      "",
      "test result: FAILED. 0 passed; 1 failed"
    ].join("\n");
    const out = parseCargoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/vault.rs",
      line: 142,
      column: 9,
      type: "error",
      symbol: "vault::tests::wrong_key_fails_decryption",
      message: "assertion failed: result.is_err()"
    });
  });

  it("parses assertion left/right failure format", () => {
    const stdout = [
      "---- db::tests::is_safe_ident stdout ----",
      "thread 'db::tests::is_safe_ident' panicked at 'assertion `left == right` failed",
      "  left: false",
      " right: true', src/db.rs:88:9",
      "",
      "failures:",
      "    db::tests::is_safe_ident"
    ].join("\n");
    const out = parseCargoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "src/db.rs",
      line: 88,
      symbol: "db::tests::is_safe_ident"
    });
  });

  it("parses multiple failures", () => {
    const stdout = [
      "---- vault::tests::test_a stdout ----",
      "thread 'vault::tests::test_a' panicked at 'boom', src/vault.rs:10:5",
      "",
      "---- db::tests::test_b stdout ----",
      "thread 'db::tests::test_b' panicked at 'crash', src/db.rs:20:3",
      "",
      "failures:",
      "    vault::tests::test_a",
      "    db::tests::test_b"
    ].join("\n");
    const out = parseCargoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("src/vault.rs");
    expect(out[1].file).toBe("src/db.rs");
  });

  it("parses from stderr", () => {
    const stderr = [
      "---- foo::tests::bar stdout ----",
      "thread 'foo::tests::bar' panicked at 'oops', src/foo.rs:5:1",
      "failures:",
      "    foo::tests::bar"
    ].join("\n");
    const out = parseCargoTest({ stdout: "", stderr, projectRoot: ROOT });
    expect(out).toHaveLength(1);
  });

  it("uses test name from failures list when no location found", () => {
    const stdout = [
      "failures:",
      "    some::tests::unknown_test",
      "",
      "test result: FAILED. 0 passed; 1 failed"
    ].join("\n");
    const out = parseCargoTest({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("some::tests::unknown_test");
    expect(out[0].file).toBe("<unknown>");
  });
});
