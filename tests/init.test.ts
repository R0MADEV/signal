import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectPackageManager,
  findPackageManager,
  isCheckScript,
  checksFromScripts
} from "../src/init.js";

describe("detectPackageManager", () => {
  it("detects pnpm from pnpm-lock.yaml", () => {
    expect(detectPackageManager(["pnpm-lock.yaml", "package.json"])).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", () => {
    expect(detectPackageManager(["yarn.lock"])).toBe("yarn");
  });

  it("detects bun from bun.lock or bun.lockb", () => {
    expect(detectPackageManager(["bun.lock"])).toBe("bun");
    expect(detectPackageManager(["bun.lockb"])).toBe("bun");
  });

  it("detects npm from package-lock.json", () => {
    expect(detectPackageManager(["package-lock.json"])).toBe("npm");
  });

  it("defaults to npm when no lockfile is present", () => {
    expect(detectPackageManager(["package.json"])).toBe("npm");
  });

  it("prefers pnpm over npm when both lockfiles exist", () => {
    expect(detectPackageManager(["package-lock.json", "pnpm-lock.yaml"])).toBe("pnpm");
  });
});

describe("findPackageManager", () => {
  it("finds the lockfile in a parent directory (monorepo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "signal-init-mono-"));
    try {
      writeFileSync(join(dir, "pnpm-lock.yaml"), "");
      const sub = join(dir, "apps", "web");
      mkdirSync(sub, { recursive: true });
      writeFileSync(join(sub, "package.json"), "{}");
      expect(findPackageManager(sub)).toBe("pnpm");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to npm when no lockfile exists anywhere up the tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "signal-init-nolock-"));
    try {
      writeFileSync(join(dir, "package.json"), "{}");
      expect(findPackageManager(dir)).toBe("npm");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("isCheckScript", () => {
  it("recognizes verification scripts", () => {
    for (const name of ["test", "tests", "lint", "typecheck", "type-check", "tsc", "check", "e2e", "test:unit", "lint:fix"]) {
      expect(isCheckScript(name)).toBe(true);
    }
  });

  it("rejects non-verification scripts", () => {
    for (const name of ["dev", "start", "build", "clean", "watch", "prepare", "generate:api"]) {
      expect(isCheckScript(name)).toBe(false);
    }
  });
});

describe("checksFromScripts", () => {
  it("maps check scripts to <pm> run <name> commands", () => {
    const scripts = { test: "vitest run", lint: "eslint .", dev: "vite", build: "vite build" };
    const checks = checksFromScripts(scripts, "pnpm");
    expect(Object.keys(checks).sort()).toEqual(["lint", "test"]);
    expect(checks.test).toEqual({ cmd: "pnpm run test" });
    expect(checks.lint).toEqual({ cmd: "pnpm run lint" });
  });

  it("uses the given package manager in the command", () => {
    const checks = checksFromScripts({ test: "jest" }, "yarn");
    expect(checks.test.cmd).toBe("yarn run test");
  });

  it("returns empty object when there are no check scripts", () => {
    expect(checksFromScripts({ dev: "vite", build: "tsc" }, "npm")).toEqual({});
  });

  it("sanitizes script names with colons into safe check names", () => {
    const checks = checksFromScripts({ "test:unit": "vitest run tests/unit" }, "npm");
    expect(checks["test_unit"]).toEqual({ cmd: "npm run test:unit" });
  });
});
