import type { AdapterName } from "./parsers/index.js";

const RULES: Array<{ pattern: RegExp; adapter: AdapterName }> = [
  { pattern: /\bvitest\b/, adapter: "vitest" },
  { pattern: /\bjest\b/, adapter: "jest" },
  { pattern: /\bpytest\b/, adapter: "pytest" },
  { pattern: /\bphpunit\b/, adapter: "phpunit" },
  { pattern: /\bphpstan\b.*--error-format=json|--error-format=json.*\bphpstan\b/, adapter: "phpstan" },
  { pattern: /\bbehat\b/, adapter: "behat" },
  { pattern: /\bpest\b/, adapter: "pest" },
  { pattern: /\bphpspec\b/, adapter: "phpspec" },
  { pattern: /\beslint\b/, adapter: "eslint" },
  { pattern: /\bbiome\b.*--reporter\s+json|--reporter\s+json.*\bbiome\b/, adapter: "biome" },
  { pattern: /\brspec\b/, adapter: "rspec" },
  { pattern: /\bgo\s+test\b/, adapter: "go_test" },
  { pattern: /\bcargo\s+test\b/, adapter: "cargo_test" },
  { pattern: /\bcargo\s+clippy\b/, adapter: "cargo_clippy" },
  { pattern: /\brubocop\b/, adapter: "rubocop" },
  { pattern: /\bmocha\b/, adapter: "mocha" },
  { pattern: /\bcypress\b/, adapter: "cypress" },
  { pattern: /\bplaywright\b/, adapter: "playwright" },
  { pattern: /\bbun\s+(--filter\s+\S+\s+)?test\b/, adapter: "bun_test" },
];

export function detectAdapter(cmd: string): AdapterName | null {
  for (const { pattern, adapter } of RULES) {
    if (pattern.test(cmd)) return adapter;
  }
  return null;
}
