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
import { parsePytest } from "./pytest.js";
import { parseBiome } from "./biome.js";
import { parseJsonLog } from "./json_log.js";
import { parseBunTest } from "./bun_test.js";
import { parseJest } from "./jest.js";
import { parseCypress } from "./cypress.js";
import { parsePlaywright } from "./playwright.js";
import { parseRspec } from "./rspec.js";
import { parseGoTest } from "./go_test.js";
import { parseCargoTest } from "./cargo_test.js";
import { parseMocha } from "./mocha.js";
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
  pytest: { name: "pytest", parse: parsePytest },
  biome: { name: "biome", parse: parseBiome },
  json_log: { name: "json_log", parse: parseJsonLog },
  bun_test: { name: "bun_test", parse: parseBunTest },
  jest: { name: "jest", parse: parseJest },
  cypress: { name: "cypress", parse: parseCypress },
  playwright: { name: "playwright", parse: parsePlaywright },
  rspec: { name: "rspec", parse: parseRspec },
  go_test: { name: "go_test", parse: parseGoTest },
  cargo_test: { name: "cargo_test", parse: parseCargoTest },
  mocha: { name: "mocha", parse: parseMocha },
  cargo_clippy: { name: "cargo_clippy", parse: parseCargoClipy },
  rubocop: { name: "rubocop", parse: parseRubocop }
};

export type { ParsedError, Parser, ParserInput } from "./types.js";
