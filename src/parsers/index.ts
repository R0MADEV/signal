import type { Parser } from "./types.js";
import { parsePhpstan, buildPhpstanRerunCmd } from "./phpstan.js";
import { parseGeneric } from "./generic.js";
import { parseEslint, buildEslintRerunCmd } from "./eslint.js";
import { parseVitest, buildVitestRerunCmd } from "./vitest.js";
import { parsePhpunit, buildPhpunitRerunCmd } from "./phpunit.js";
import { parsePest, buildPestRerunCmd } from "./pest.js";
import { parseBehat, buildBehatRerunCmd } from "./behat.js";
import { parseJunit, buildJunitRerunCmd } from "./junit.js";
import { parsePhpspec, buildPhpspecRerunCmd } from "./phpspec.js";
import { parseSymfonyLog } from "./symfony_log.js";
import { parsePytest, buildPytestRerunCmd } from "./pytest.js";
import { parseBiome } from "./biome.js";
import { parseJsonLog } from "./json_log.js";
import { parseBunTest, buildBunTestRerunCmd } from "./bun_test.js";
import { parseJest, buildJestRerunCmd } from "./jest.js";
import { parseCypress, buildCypressRerunCmd } from "./cypress.js";
import { parsePlaywright, buildPlaywrightRerunCmd } from "./playwright.js";
import { parseRspec, buildRspecRerunCmd } from "./rspec.js";
import { parseGoTest, buildGoTestRerunCmd } from "./go_test.js";
import { parseCargoTest, buildCargoTestRerunCmd } from "./cargo_test.js";
import { parseMocha, buildMochaRerunCmd } from "./mocha.js";
import { parseCargoClipy } from "./cargo_clippy.js";
import { parseRubocop } from "./rubocop.js";

export type AdapterName =
  | "phpstan"
  | "generic"
  | "eslint"
  | "vitest"
  | "phpunit"
  | "pest"
  | "behat"
  | "junit"
  | "phpspec"
  | "symfony_log"
  | "pytest"
  | "biome"
  | "json_log"
  | "bun_test"
  | "jest"
  | "cypress"
  | "playwright"
  | "rspec"
  | "go_test"
  | "cargo_test"
  | "mocha"
  | "cargo_clippy"
  | "rubocop";

export const parsers: Record<AdapterName, Parser> = {
  phpstan: { name: "phpstan", parse: parsePhpstan, buildRerunCmd: buildPhpstanRerunCmd },
  generic: { name: "generic", parse: parseGeneric },
  eslint: { name: "eslint", parse: parseEslint, buildRerunCmd: buildEslintRerunCmd },
  vitest: { name: "vitest", parse: parseVitest, buildRerunCmd: buildVitestRerunCmd },
  phpunit: { name: "phpunit", parse: parsePhpunit, buildRerunCmd: buildPhpunitRerunCmd },
  pest: { name: "pest", parse: parsePest, buildRerunCmd: buildPestRerunCmd },
  behat: { name: "behat", parse: parseBehat, buildRerunCmd: buildBehatRerunCmd },
  junit: { name: "junit", parse: parseJunit, buildRerunCmd: buildJunitRerunCmd },
  phpspec: { name: "phpspec", parse: parsePhpspec, buildRerunCmd: buildPhpspecRerunCmd },
  symfony_log: { name: "symfony_log", parse: parseSymfonyLog },
  pytest: { name: "pytest", parse: parsePytest, buildRerunCmd: buildPytestRerunCmd },
  biome: { name: "biome", parse: parseBiome },
  json_log: { name: "json_log", parse: parseJsonLog },
  bun_test: { name: "bun_test", parse: parseBunTest, buildRerunCmd: buildBunTestRerunCmd },
  jest: { name: "jest", parse: parseJest, buildRerunCmd: buildJestRerunCmd },
  cypress: { name: "cypress", parse: parseCypress, buildRerunCmd: buildCypressRerunCmd },
  playwright: { name: "playwright", parse: parsePlaywright, buildRerunCmd: buildPlaywrightRerunCmd },
  rspec: { name: "rspec", parse: parseRspec, buildRerunCmd: buildRspecRerunCmd },
  go_test: { name: "go_test", parse: parseGoTest, buildRerunCmd: buildGoTestRerunCmd },
  cargo_test: { name: "cargo_test", parse: parseCargoTest, buildRerunCmd: buildCargoTestRerunCmd },
  mocha: { name: "mocha", parse: parseMocha, buildRerunCmd: buildMochaRerunCmd },
  cargo_clippy: { name: "cargo_clippy", parse: parseCargoClipy },
  rubocop: { name: "rubocop", parse: parseRubocop }
};

export type { ParsedError, Parser, ParserInput } from "./types.js";
