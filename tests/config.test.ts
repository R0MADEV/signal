import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  describe("single-cmd checks", () => {
    it("accepts a minimal single-cmd check", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          lint: { cmd: "npm run lint" }
        }
      });
      const c = cfg.checks.lint;
      expect("cmd" in c && c.cmd).toBe("npm run lint");
    });

    it("applies default adapter and timeout for single-cmd", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          lint: { cmd: "x" }
        }
      });
      const c = cfg.checks.lint;
      if ("cmd" in c) {
        expect(c.adapter).toBe("generic");
        expect(c.timeout_ms).toBe(60_000);
      } else {
        throw new Error("expected single-cmd shape");
      }
    });
  });

  describe("multi-step checks", () => {
    it("accepts a check with steps[]", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          behat: {
            steps: [
              { name: "clean", cmd: "rm -rf var" },
              { name: "test", cmd: "vendor/bin/behat", adapter: "generic" }
            ]
          }
        }
      });
      const c = cfg.checks.behat;
      expect("steps" in c).toBe(true);
      if ("steps" in c) {
        expect(c.steps).toHaveLength(2);
        expect(c.steps[0].name).toBe("clean");
        expect(c.steps[1].adapter).toBe("generic");
      }
    });

    it("default fail_fast is true", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: { steps: [{ name: "a", cmd: "echo" }] }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.fail_fast).toBe(true);
      } else {
        throw new Error("expected multi-step shape");
      }
    });

    it("default adapter per step is generic", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: { steps: [{ name: "a", cmd: "echo" }] }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.steps[0].adapter).toBe("generic");
      }
    });

    it("default step timeout_ms is 60_000", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: { steps: [{ name: "a", cmd: "echo" }] }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.steps[0].timeout_ms).toBe(60_000);
      }
    });

    it("rejects a check with both cmd and steps", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { cmd: "echo", steps: [{ name: "a", cmd: "x" }] }
          }
        })
      ).toThrow();
    });

    it("rejects a step without name", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { steps: [{ cmd: "echo" }] }
          }
        })
      ).toThrow();
    });

    it("rejects a step without cmd", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { steps: [{ name: "a" }] }
          }
        })
      ).toThrow();
    });

    it("rejects empty steps[]", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { steps: [] }
          }
        })
      ).toThrow();
    });

    it("rejects step name with path separator or traversal", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { steps: [{ name: "../escape", cmd: "echo" }] }
          }
        })
      ).toThrow();
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: { steps: [{ name: "a/b", cmd: "echo" }] }
          }
        })
      ).toThrow();
    });

    it("rejects duplicate step names within a check", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: {
              steps: [
                { name: "same", cmd: "echo a" },
                { name: "same", cmd: "echo b" }
              ]
            }
          }
        })
      ).toThrow(/duplicate/i);
    });

    it("allows fail_fast=false explicitly", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: {
            steps: [{ name: "a", cmd: "echo" }],
            fail_fast: false
          }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.fail_fast).toBe(false);
      }
    });

    it("allows different adapters per step", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: {
            steps: [
              { name: "static", cmd: "phpstan analyse --error-format=json", adapter: "phpstan" },
              { name: "lint", cmd: "eslint .", adapter: "eslint" },
              { name: "tsc", cmd: "tsc --noEmit", adapter: "generic" }
            ]
          }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.steps.map((s) => s.adapter)).toEqual(["phpstan", "eslint", "generic"]);
      }
    });
  });

  describe("strip_path_prefix", () => {
    it("accepts strip_path_prefix on a single check", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: { cmd: "echo", strip_path_prefix: "/opt/symfony" }
        }
      });
      const c = cfg.checks.x;
      if ("cmd" in c) expect(c.strip_path_prefix).toBe("/opt/symfony");
    });

    it("accepts strip_path_prefix on a step", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: {
            steps: [{ name: "a", cmd: "echo", strip_path_prefix: "/opt/proj" }]
          }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) expect(c.steps[0].strip_path_prefix).toBe("/opt/proj");
    });

    it("strip_path_prefix is optional", () => {
      const cfg = parseConfig({
        root: ".",
        checks: { x: { cmd: "echo" } }
      });
      const c = cfg.checks.x;
      if ("cmd" in c) expect(c.strip_path_prefix).toBeUndefined();
    });
  });

  describe("on_failure", () => {
    it("accepts a single-cmd check with on_failure", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: {
            cmd: "vendor/bin/phpunit",
            on_failure: "tail -50 var/log/test.log"
          }
        }
      });
      const c = cfg.checks.x;
      if ("cmd" in c) {
        expect(c.on_failure).toBe("tail -50 var/log/test.log");
      } else {
        throw new Error("expected single shape");
      }
    });

    it("accepts a step with on_failure", () => {
      const cfg = parseConfig({
        root: ".",
        checks: {
          x: {
            steps: [
              {
                name: "behat",
                cmd: "vendor/bin/behat",
                on_failure: "curl -s http://localhost/clients"
              }
            ]
          }
        }
      });
      const c = cfg.checks.x;
      if ("steps" in c) {
        expect(c.steps[0].on_failure).toBe("curl -s http://localhost/clients");
      }
    });

    it("on_failure is optional and defaults to undefined", () => {
      const cfg = parseConfig({
        root: ".",
        checks: { x: { cmd: "echo" } }
      });
      const c = cfg.checks.x;
      if ("cmd" in c) {
        expect(c.on_failure).toBeUndefined();
      }
    });

    it("rejects an empty on_failure string", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: { x: { cmd: "echo", on_failure: "" } }
        })
      ).toThrow();
    });
  });

  describe("structural", () => {
    it("rejects empty checks (no cmd, no steps)", () => {
      expect(() =>
        parseConfig({
          root: ".",
          checks: {
            x: {}
          }
        })
      ).toThrow();
    });

    it("default root is '.'", () => {
      const cfg = parseConfig({
        checks: {
          lint: { cmd: "x" }
        }
      });
      expect(cfg.root).toBe(".");
    });
  });
});
