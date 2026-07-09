import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchConfig } from "../src/watch_config.js";
import type { ChecksDeps } from "../src/checks.js";
import { Storage } from "../src/storage.js";
import { Runner } from "../src/runner.js";
import type { Config } from "../src/config.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "signal-hot-reload-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeConfig(checks: Config["checks"]): Config {
  return { root, checks };
}

function writeSingleProjectConfig(configPath: string, checkCmd: string) {
  const raw = {
    projects: {
      test: {
        root,
        checks: {
          mycheck: { cmd: checkCmd }
        }
      }
    }
  };
  writeFileSync(configPath, JSON.stringify(raw));
}

describe("watchConfig", () => {
  it("returns a stop function", () => {
    const configPath = join(root, "signal.config.json");
    writeSingleProjectConfig(configPath, "echo initial");

    const deps: ChecksDeps = {
      config: makeConfig({ mycheck: { cmd: "echo initial", timeout_ms: 5000, adapter: "generic" } }),
      storage: new Storage(root),
      runner: new Runner(new Storage(root))
    };

    const stop = watchConfig(configPath, "test", deps);
    expect(typeof stop).toBe("function");
    stop();
  });

  it("updates deps.config when the file changes", async () => {
    const configPath = join(root, "signal.config.json");
    writeSingleProjectConfig(configPath, "echo initial");

    const deps: ChecksDeps = {
      config: makeConfig({ mycheck: { cmd: "echo initial", timeout_ms: 5000, adapter: "generic" } }),
      storage: new Storage(root),
      runner: new Runner(new Storage(root))
    };

    const stop = watchConfig(configPath, "test", deps);

    // change the config file
    await new Promise(r => setTimeout(r, 50));
    writeSingleProjectConfig(configPath, "echo updated");

    // wait for fs.watch to fire
    await new Promise(r => setTimeout(r, 300));

    const check = deps.config.checks.mycheck;
    if ("cmd" in check) {
      expect(check.cmd).toBe("echo updated");
    } else {
      throw new Error("expected single-cmd check");
    }

    stop();
  });

  it("does not crash when config file is temporarily invalid", async () => {
    const configPath = join(root, "signal.config.json");
    writeSingleProjectConfig(configPath, "echo initial");

    const deps: ChecksDeps = {
      config: makeConfig({ mycheck: { cmd: "echo initial", timeout_ms: 5000, adapter: "generic" } }),
      storage: new Storage(root),
      runner: new Runner(new Storage(root))
    };

    const stop = watchConfig(configPath, "test", deps);

    await new Promise(r => setTimeout(r, 50));
    writeFileSync(configPath, "{ invalid json }}}");

    await new Promise(r => setTimeout(r, 300));

    // config should remain unchanged
    const check = deps.config.checks.mycheck;
    if ("cmd" in check) {
      expect(check.cmd).toBe("echo initial");
    }

    stop();
  });
});
