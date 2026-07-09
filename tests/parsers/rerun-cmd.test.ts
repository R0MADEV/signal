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

  describe("pytest", () => {
    it("appends file::symbol -v to the cmd", () => {
      const g = group({
        symbol: "TestAuth::test_login",
        files: ["tests/unit/test_auth.py"],
        occurrences: [{ file: "tests/unit/test_auth.py", line: 42, column: null }]
      });
      const out = parsers.pytest.buildRerunCmd!("uv run pytest", g);
      expect(out).toBe("uv run pytest tests/unit/test_auth.py::TestAuth::test_login -v");
    });

    it("returns null when no symbol", () => {
      const g = group({ files: ["tests/test_foo.py"], occurrences: [] });
      expect(parsers.pytest.buildRerunCmd!("pytest", g)).toBeNull();
    });
  });

  describe("jest", () => {
    it("appends --testPathPattern and --testNamePattern", () => {
      const g = group({
        symbol: "AuthService › login › should return a token",
        files: ["src/auth/AuthService.test.ts"],
        occurrences: [{ file: "src/auth/AuthService.test.ts", line: 42, column: 5 }]
      });
      const out = parsers.jest.buildRerunCmd!("npx jest", g);
      expect(out).toBe('npx jest --testPathPattern="src/auth/AuthService.test.ts" --testNamePattern="should return a token"');
    });

    it("falls back to file only when no symbol", () => {
      const g = group({ files: ["src/foo.test.ts"], occurrences: [] });
      const out = parsers.jest.buildRerunCmd!("npx jest", g);
      expect(out).toBe('npx jest --testPathPattern="src/foo.test.ts"');
    });
  });

  describe("rspec", () => {
    it("appends file:line to the cmd", () => {
      const g = group({
        symbol: "User#full_name returns the full name",
        files: ["spec/models/user_spec.rb"],
        occurrences: [{ file: "spec/models/user_spec.rb", line: 15, column: null }]
      });
      const out = parsers.rspec.buildRerunCmd!("bundle exec rspec", g);
      expect(out).toBe("bundle exec rspec spec/models/user_spec.rb:15");
    });

    it("appends file only when no line", () => {
      const g = group({
        files: ["spec/models/user_spec.rb"],
        occurrences: [{ file: "spec/models/user_spec.rb", line: null, column: null }]
      });
      const out = parsers.rspec.buildRerunCmd!("bundle exec rspec", g);
      expect(out).toBe("bundle exec rspec spec/models/user_spec.rb");
    });
  });

  describe("go_test", () => {
    it("appends -run symbol -v to the cmd", () => {
      const g = group({
        symbol: "TestAuth/login",
        files: ["auth_test.go"],
        occurrences: [{ file: "auth_test.go", line: 42, column: null }]
      });
      const out = parsers.go_test.buildRerunCmd!("go test ./...", g);
      expect(out).toBe('go test ./... -run "TestAuth/login" -v');
    });

    it("returns null when no symbol", () => {
      const g = group({ files: ["foo_test.go"], occurrences: [] });
      expect(parsers.go_test.buildRerunCmd!("go test ./...", g)).toBeNull();
    });
  });

  describe("cargo_test", () => {
    it("appends the symbol (test path) to cargo test", () => {
      const g = group({
        symbol: "vault::tests::encrypt_decrypt_roundtrip",
        files: ["src/vault.rs"],
        occurrences: [{ file: "src/vault.rs", line: 142, column: null }]
      });
      const out = parsers.cargo_test.buildRerunCmd!("cargo test", g);
      expect(out).toBe("cargo test vault::tests::encrypt_decrypt_roundtrip");
    });

    it("returns null when no symbol", () => {
      const g = group({ files: ["src/foo.rs"], occurrences: [] });
      expect(parsers.cargo_test.buildRerunCmd!("cargo test", g)).toBeNull();
    });
  });

  describe("mocha", () => {
    it("appends --grep with last part of symbol and file", () => {
      const g = group({
        symbol: "Auth login should return a token",
        files: ["test/auth.test.js"],
        occurrences: [{ file: "test/auth.test.js", line: 15, column: null }]
      });
      const out = parsers.mocha.buildRerunCmd!("npx mocha", g);
      expect(out).toBe('npx mocha --grep "Auth login should return a token" test/auth.test.js');
    });

    it("returns null when no file", () => {
      const g = group({ symbol: "foo", files: [], occurrences: [] });
      expect(parsers.mocha.buildRerunCmd!("mocha", g)).toBeNull();
    });
  });

  describe("bun_test", () => {
    it("appends --test-name-pattern and file", () => {
      const g = group({
        symbol: "subtracts numbers",
        files: ["src/foo.test.ts"],
        occurrences: [{ file: "src/foo.test.ts", line: 10, column: null }]
      });
      const out = parsers.bun_test.buildRerunCmd!("bun test", g);
      expect(out).toBe('bun test --test-name-pattern "subtracts numbers" src/foo.test.ts');
    });

    it("returns null when no file", () => {
      const g = group({ symbol: "foo", files: [], occurrences: [] });
      expect(parsers.bun_test.buildRerunCmd!("bun test", g)).toBeNull();
    });
  });

  describe("playwright", () => {
    it("appends file and --grep with last segment of symbol", () => {
      const g = group({
        symbol: "Login › should show error on wrong password",
        files: ["auth/login.spec.ts"],
        occurrences: [{ file: "auth/login.spec.ts", line: 25, column: null }]
      });
      const out = parsers.playwright.buildRerunCmd!("npx playwright test", g);
      expect(out).toBe('npx playwright test auth/login.spec.ts --grep "should show error on wrong password"');
    });

    it("falls back to file only when no symbol", () => {
      const g = group({ files: ["auth/login.spec.ts"], occurrences: [] });
      const out = parsers.playwright.buildRerunCmd!("npx playwright test", g);
      expect(out).toBe("npx playwright test auth/login.spec.ts");
    });
  });

  describe("cypress", () => {
    it("appends --spec with the file", () => {
      const g = group({
        symbol: "Login › should redirect after login",
        files: ["cypress/e2e/auth/login.cy.ts"],
        occurrences: [{ file: "cypress/e2e/auth/login.cy.ts", line: 25, column: null }]
      });
      const out = parsers.cypress.buildRerunCmd!("npx cypress run", g);
      expect(out).toBe('npx cypress run --spec "cypress/e2e/auth/login.cy.ts"');
    });

    it("returns null when no file", () => {
      const g = group({ files: [], occurrences: [] });
      expect(parsers.cypress.buildRerunCmd!("npx cypress run", g)).toBeNull();
    });
  });
});
