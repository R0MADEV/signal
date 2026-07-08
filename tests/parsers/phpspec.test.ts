import { describe, it, expect } from "vitest";
import { parsePhpspec } from "../../src/parsers/phpspec.js";

const ROOT = "/var/www/html";

describe("parsePhpspec", () => {
  it("returns [] for empty input", () => {
    expect(parsePhpspec({ stdout: "", stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("returns [] when all specs pass", () => {
    const stdout = ". 5 examples, 0 failures\n";
    expect(parsePhpspec({ stdout, stderr: "", projectRoot: ROOT })).toEqual([]);
  });

  it("parses an exception failure (inline format)", () => {
    const stdout = [
      "Isbc\\Domain\\Model\\Pbx\\Pbx",
      "  42  - it is initializable",
      "       exception [err:TypeError(\"Argument 1 passed to Pbx::__construct()\")] has been thrown."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "spec/Isbc/Domain/Model/Pbx/PbxSpec.php",
      line: 42,
      column: null,
      type: "phpspec",
      symbol: "Isbc/Domain/Model/Pbx/Pbx > it is initializable",
      message: expect.stringContaining("TypeError")
    });
  });

  it("parses a FailureException (two-line format)", () => {
    const stdout = [
      "Isbc\\Domain\\Model\\Pbx\\Pbx",
      "  55  - it does something",
      "       PhpSpec\\Exception\\Example\\FailureException",
      "         expected true, but got false."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      file: "spec/Isbc/Domain/Model/Pbx/PbxSpec.php",
      line: 55,
      symbol: "Isbc/Domain/Model/Pbx/Pbx > it does something",
      message: "expected true, but got false."
    });
  });

  it("parses spec class from progress-bar line (backspace format)", () => {
    const stdout = [
      "\x08/ 3 examplesIsbc\\Domain\\Model\\User\\User   ",
      "  10  - it has an id",
      "       exception [err:RuntimeError(\"not found\")] has been thrown."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("spec/Isbc/Domain/Model/User/UserSpec.php");
    expect(out[0].line).toBe(10);
  });

  it("parses multiple failures across different specs", () => {
    const stdout = [
      "Isbc\\Domain\\Model\\Pbx\\Pbx",
      "  42  - it is initializable",
      "       exception [err:TypeError(\"boom\")] has been thrown.",
      "",
      "Isbc\\Domain\\Model\\User\\User",
      "  10  - it has a name",
      "       PhpSpec\\Exception\\Example\\FailureException",
      "         expected 'foo', but got 'bar'."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out).toHaveLength(2);
    expect(out[0].file).toBe("spec/Isbc/Domain/Model/Pbx/PbxSpec.php");
    expect(out[1].file).toBe("spec/Isbc/Domain/Model/User/UserSpec.php");
  });

  it("maps class path to spec file correctly", () => {
    const stdout = [
      "Isbc\\Application\\Service\\Transcription\\TranscriptionService",
      "  99  - it transcribes audio",
      "       exception [err:RuntimeError(\"fail\")] has been thrown."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].file).toBe(
      "spec/Isbc/Application/Service/Transcription/TranscriptionServiceSpec.php"
    );
  });

  it("includes symbol with spec class and description", () => {
    const stdout = [
      "Isbc\\Domain\\Model\\Pbx\\Pbx",
      "  1  - it validates the number",
      "       PhpSpec\\Exception\\Example\\FailureException",
      "         expected false."
    ].join("\n");
    const out = parsePhpspec({ stdout, stderr: "", projectRoot: ROOT });
    expect(out[0].symbol).toBe("Isbc/Domain/Model/Pbx/Pbx > it validates the number");
  });
});
