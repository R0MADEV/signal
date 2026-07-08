import { describe, it, expect } from "vitest";
import { detectAdapter } from "../src/detect_adapter.js";

describe("detectAdapter", () => {
  it("returns null for unknown commands", () => {
    expect(detectAdapter("echo hello")).toBeNull();
    expect(detectAdapter("make test")).toBeNull();
  });

  it("detects vitest", () => {
    expect(detectAdapter("npx vitest run")).toBe("vitest");
    expect(detectAdapter("vitest run")).toBe("vitest");
    expect(detectAdapter("pnpm vitest run")).toBe("vitest");
    expect(detectAdapter("bun run vitest")).toBe("vitest");
  });

  it("detects jest", () => {
    expect(detectAdapter("npx jest")).toBe("jest");
    expect(detectAdapter("jest --coverage")).toBe("jest");
    expect(detectAdapter("node_modules/.bin/jest")).toBe("jest");
  });

  it("detects pytest", () => {
    expect(detectAdapter("pytest")).toBe("pytest");
    expect(detectAdapter("uv run pytest tests/")).toBe("pytest");
    expect(detectAdapter("python -m pytest")).toBe("pytest");
  });

  it("detects phpunit", () => {
    expect(detectAdapter("vendor/bin/phpunit")).toBe("phpunit");
    expect(detectAdapter("./vendor/bin/phpunit --filter foo")).toBe("phpunit");
  });

  it("detects phpstan with json format", () => {
    expect(detectAdapter("vendor/bin/phpstan analyse --error-format=json")).toBe("phpstan");
    expect(detectAdapter("bin/test-phpstan --error-format=json")).toBe("phpstan");
  });

  it("detects behat", () => {
    expect(detectAdapter("vendor/bin/behat")).toBe("behat");
  });

  it("detects pest", () => {
    expect(detectAdapter("vendor/bin/pest")).toBe("pest");
    expect(detectAdapter("./vendor/bin/pest --parallel")).toBe("pest");
  });

  it("detects phpspec", () => {
    expect(detectAdapter("vendor/bin/phpspec run")).toBe("phpspec");
  });

  it("detects eslint", () => {
    expect(detectAdapter("eslint src/")).toBe("eslint");
    expect(detectAdapter("npx eslint .")).toBe("eslint");
    expect(detectAdapter("pnpm eslint")).toBe("eslint");
  });

  it("detects biome with json reporter", () => {
    expect(detectAdapter("biome check --reporter json")).toBe("biome");
    expect(detectAdapter("pnpm exec biome check src --reporter json")).toBe("biome");
  });

  it("detects rspec", () => {
    expect(detectAdapter("bundle exec rspec")).toBe("rspec");
    expect(detectAdapter("rspec spec/")).toBe("rspec");
  });

  it("detects go test", () => {
    expect(detectAdapter("go test ./...")).toBe("go_test");
    expect(detectAdapter("go test ./pkg/...")).toBe("go_test");
  });

  it("detects cargo test", () => {
    expect(detectAdapter("cargo test")).toBe("cargo_test");
    expect(detectAdapter("cargo test --release")).toBe("cargo_test");
  });

  it("detects mocha", () => {
    expect(detectAdapter("mocha tests/")).toBe("mocha");
    expect(detectAdapter("npx mocha --recursive")).toBe("mocha");
    expect(detectAdapter("node_modules/.bin/mocha")).toBe("mocha");
  });

  it("detects cypress", () => {
    expect(detectAdapter("cypress run")).toBe("cypress");
    expect(detectAdapter("npx cypress run --browser chromium")).toBe("cypress");
  });

  it("detects playwright", () => {
    expect(detectAdapter("playwright test")).toBe("playwright");
    expect(detectAdapter("npx playwright test")).toBe("playwright");
  });

  it("detects bun test", () => {
    expect(detectAdapter("bun test")).toBe("bun_test");
    expect(detectAdapter("bun --filter '*' test")).toBe("bun_test");
  });
});
