import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseConfig } from "../src/config.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.MY_CONTAINER = "my-app";
  process.env.WORKSPACE = "/home/user/project";
  process.env.PORT = "8080";
});

afterEach(() => {
  // restore env
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
});

describe("environment variable interpolation in config", () => {
  it("interpolates ${VAR} in cmd", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "docker exec ${MY_CONTAINER} pytest" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.cmd).toBe("docker exec my-app pytest");
  });

  it("interpolates multiple variables in the same cmd", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "cd ${WORKSPACE} && docker exec ${MY_CONTAINER} pytest" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.cmd).toBe("cd /home/user/project && docker exec my-app pytest");
  });

  it("interpolates ${VAR} in cwd", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "pytest", cwd: "${WORKSPACE}/backend" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.cwd).toBe("/home/user/project/backend");
  });

  it("interpolates ${VAR} in strip_path_prefix", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "pytest", strip_path_prefix: "${WORKSPACE}/" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.strip_path_prefix).toBe("/home/user/project/");
  });

  it("interpolates ${VAR} in step cmd", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        ci: {
          steps: [
            { name: "test", cmd: "docker exec ${MY_CONTAINER} vendor/bin/phpunit" }
          ]
        }
      }
    });
    const c = cfg.checks.ci;
    if ("steps" in c) expect(c.steps[0].cmd).toBe("docker exec my-app vendor/bin/phpunit");
  });

  it("leaves ${VAR} unchanged when variable is not set", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "docker exec ${UNDEFINED_VAR_XYZ} pytest" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.cmd).toBe("docker exec ${UNDEFINED_VAR_XYZ} pytest");
  });

  it("interpolates ${VAR} in root", () => {
    const cfg = parseConfig({
      root: "${WORKSPACE}",
      checks: {
        test: { cmd: "pytest" }
      }
    });
    expect(cfg.root).toBe("/home/user/project");
  });

  it("does not interpolate $VAR without braces (only ${VAR} syntax)", () => {
    const cfg = parseConfig({
      root: ".",
      checks: {
        test: { cmd: "echo $MY_CONTAINER" }
      }
    });
    const c = cfg.checks.test;
    if ("cmd" in c) expect(c.cmd).toBe("echo $MY_CONTAINER");
  });
});
