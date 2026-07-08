import { describe, it, expect } from "vitest";
import { parsers } from "../../src/parsers/index.js";
import type { RerunGroup } from "../../src/parsers/types.js";

function group(over: Partial<RerunGroup>): RerunGroup {
  return {
    symbol: undefined,
    message: "",
    files: [],
    occurrences: [],
    ...over
  };
}

describe("buildRerunCmd per adapter", () => {
  describe("behat", () => {
    it("appends '<file>:<line> -vv' to the original cmd", () => {
      const g = group({
        symbol: "Retrieve clients",
        files: ["features/aps/client/getClient.feature"],
        occurrences: [{ file: "features/aps/client/getClient.feature", line: 7, column: null }]
      });
      const out = parsers.behat.buildRerunCmd!(
        "docker exec aps-fpm vendor/bin/behat",
        g
      );
      expect(out).toBe("docker exec aps-fpm vendor/bin/behat features/aps/client/getClient.feature:7 -vv");
    });

    it("returns null when there is no occurrence with a line", () => {
      const g = group({ files: ["x.feature"], occurrences: [] });
      expect(parsers.behat.buildRerunCmd!("vendor/bin/behat", g)).toBeNull();
    });
  });

  describe("phpunit", () => {
    it("appends --filter with the test class::method", () => {
      const g = group({
        symbol: "Aps\\Domain\\Model\\X\\YTest::test_runner",
        files: ["tests/Aps/Domain/Model/X/YTest.php"],
        occurrences: [{ file: "tests/Aps/Domain/Model/X/YTest.php", line: 47, column: null }]
      });
      const out = parsers.phpunit.buildRerunCmd!(
        "docker exec aps-fpm vendor/bin/phpunit",
        g
      );
      expect(out).toBe("docker exec aps-fpm vendor/bin/phpunit --filter 'Aps\\\\Domain\\\\Model\\\\X\\\\YTest::test_runner'");
    });

    it("returns null when the group has no symbol", () => {
      const g = group({});
      expect(parsers.phpunit.buildRerunCmd!("vendor/bin/phpunit", g)).toBeNull();
    });
  });

  describe("pest", () => {
    it("appends --filter with the test name", () => {
      const g = group({
        symbol: "X > does something specific",
        files: ["tests/X.php"],
        occurrences: [{ file: "tests/X.php", line: 14, column: null }]
      });
      const out = parsers.pest.buildRerunCmd!("vendor/bin/pest", g);
      expect(out).toBe("vendor/bin/pest --filter 'does something specific'");
    });
  });

  describe("vitest", () => {
    it("appends -t '<test name>' <file>", () => {
      const g = group({
        symbol: "Storage > rejects empty root",
        files: ["tests/storage.test.ts"],
        occurrences: [{ file: "tests/storage.test.ts", line: 22, column: null }]
      });
      const out = parsers.vitest.buildRerunCmd!("npx vitest run", g);
      expect(out).toBe('npx vitest run -t "rejects empty root" tests/storage.test.ts');
    });

    it("falls back to file only if no symbol", () => {
      const g = group({
        files: ["tests/x.test.ts"],
        occurrences: [{ file: "tests/x.test.ts", line: 1, column: null }]
      });
      const out = parsers.vitest.buildRerunCmd!("npx vitest run", g);
      expect(out).toBe("npx vitest run tests/x.test.ts");
    });
  });

  describe("eslint", () => {
    it("appends the file path to lint just that file", () => {
      const g = group({
        symbol: "no-unused-vars",
        files: ["src/foo.ts"],
        occurrences: [{ file: "src/foo.ts", line: 10, column: 5 }]
      });
      const out = parsers.eslint.buildRerunCmd!("eslint .", g);
      expect(out).toBe("eslint . src/foo.ts");
    });
  });

  describe("phpstan", () => {
    it("appends file path to analyse only that file", () => {
      const g = group({
        symbol: "UserId::fromString",
        files: ["src/User/Handler.php"],
        occurrences: [{ file: "src/User/Handler.php", line: 42, column: null }]
      });
      const out = parsers.phpstan.buildRerunCmd!(
        "vendor/bin/phpstan analyse --error-format=json",
        g
      );
      expect(out).toBe("vendor/bin/phpstan analyse --error-format=json src/User/Handler.php");
    });

    it("returns null for global errors (no real file)", () => {
      const g = group({ files: ["<global>"], occurrences: [{ file: "<global>", line: null, column: null }] });
      expect(parsers.phpstan.buildRerunCmd!("phpstan analyse", g)).toBeNull();
    });
  });

  describe("generic", () => {
    it("does not implement buildRerunCmd (undefined)", () => {
      expect(parsers.generic.buildRerunCmd).toBeUndefined();
    });
  });
});
