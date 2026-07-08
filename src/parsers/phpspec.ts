import type { ParsedError, ParserInput, RerunGroup } from "./types.js";

// PHPSpec output format:
//
// Aps/Domain/Model/Foo/Foo
//   41  - it is initializable
//       exception [err:TypeError("msg...")] has been thrown.
//
//   55  - it does something
//       PhpSpec\Exception\Example\FailureException
//         expected true, but got false.

// Matches a standalone header line OR a spec name embedded at the end of a progress line
// e.g. "/ 1 examplesAps/Domain/Model/Foo/Foo   "
const SPEC_HEADER_RE = /(?:^|\d+\s*examples?)([A-Z][A-Za-z0-9_/\\]+)\s*$/;
const EXAMPLE_RE = /^\s{2}(\d+)\s+-\s+(.+)$/;
const EXCEPTION_INLINE_RE = /^\s+exception\s+\[err:([^\(]+)\("([\s\S]+?)"\)\]/;
const FAILURE_CLASS_RE = /^\s+(PhpSpec\\[^\s]+)\s*$/;
const FAILURE_MSG_RE = /^\s{8,}(.+)$/;

export function parsePhpspec({ stdout }: ParserInput): ParsedError[] {
  const errors: ParsedError[] = [];
  // PHPSpec uses \x08 (backspace) to animate progress in the terminal.
  // Strip them so the spec class name is left as plain text.
  const lines = stdout
    .replace(/\x08+/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  let currentSpec = "";
  let currentLine: number | null = null;
  let currentDescription = "";
  let awaitingFailureMsg = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    const headerMatch = SPEC_HEADER_RE.exec(raw);
    if (headerMatch) {
      currentSpec = headerMatch[1].replace(/\\/g, "/");
      currentLine = null;
      awaitingFailureMsg = false;
      continue;
    }

    const exampleMatch = EXAMPLE_RE.exec(raw);
    if (exampleMatch) {
      currentLine = parseInt(exampleMatch[1], 10);
      currentDescription = exampleMatch[2].trim();
      awaitingFailureMsg = false;
      continue;
    }

    if (currentLine === null) continue;

    const inlineMatch = EXCEPTION_INLINE_RE.exec(raw);
    if (inlineMatch) {
      errors.push({
        type: "phpspec",
        file: specFileFromClass(currentSpec),
        line: currentLine,
        column: null,
        symbol: `${currentSpec} > ${currentDescription}`,
        message: `${inlineMatch[1].trim()}: ${inlineMatch[2].trim()}`
      });
      currentLine = null;
      awaitingFailureMsg = false;
      continue;
    }

    const failureClassMatch = FAILURE_CLASS_RE.exec(raw);
    if (failureClassMatch) {
      awaitingFailureMsg = true;
      continue;
    }

    if (awaitingFailureMsg) {
      const msgMatch = FAILURE_MSG_RE.exec(raw);
      if (msgMatch) {
        errors.push({
          type: "phpspec",
          file: specFileFromClass(currentSpec),
          line: currentLine,
          column: null,
          symbol: `${currentSpec} > ${currentDescription}`,
          message: msgMatch[1].trim()
        });
        currentLine = null;
        awaitingFailureMsg = false;
      }
    }
  }

  return errors;
}

export function buildPhpspecRerunCmd(originalCmd: string, group: RerunGroup): string | null {
  const file = group.files[0];
  const line = group.occurrences[0]?.line;
  if (!file) return null;
  const target = line != null ? `${file}:${line}` : file;
  return `${originalCmd} ${target}`;
}

function specFileFromClass(cls: string): string {
  if (!cls) return "<unknown>";
  const parts = cls.split("/");
  parts[parts.length - 1] = parts[parts.length - 1] + "Spec";
  return `spec/${parts.join("/")}.php`;
}
