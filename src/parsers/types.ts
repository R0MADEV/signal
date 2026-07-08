export interface ParsedError {
  file: string;
  line: number | null;
  column: number | null;
  type: string;
  message: string;
  symbol?: string;
  raw?: string;
  context?: string;
}

export interface ParserInput {
  stdout: string;
  stderr: string;
  projectRoot: string;
}

export interface RerunGroup {
  symbol?: string;
  message: string;
  files: string[];
  occurrences: Array<{ file: string; line: number | null; column: number | null }>;
}

export interface Parser {
  name: string;
  parse(input: ParserInput): ParsedError[];
  buildRerunCmd?(originalCmd: string, group: RerunGroup): string | null;
}
