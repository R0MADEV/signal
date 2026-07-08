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
  | "bun_test";

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
  bun_test: { name: "bun_test", parse: parseBunTest }
};

export type { ParsedError, Parser, ParserInput } from "./types.js";
