import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type CheckDef = { cmd: string };
type Checks = Record<string, CheckDef>;

const CHECK_KEYWORDS = ["test", "lint", "check", "tsc", "type", "e2e", "spec"];

export function detectPackageManager(files: string[]): PackageManager {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lock") || files.includes("bun.lockb")) return "bun";
  return "npm";
}

const LOCKFILES = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "package-lock.json"];

/** Walk up from dir to find the nearest lockfile (handles monorepos where it lives at the root). */
export function findPackageManager(dir: string): PackageManager {
  let current = resolve(dir);
  while (true) {
    const present = LOCKFILES.filter((f) => existsSync(join(current, f)));
    if (present.length > 0) return detectPackageManager(present);
    const parent = dirname(current);
    if (parent === current) return "npm";
    current = parent;
  }
}

export function isCheckScript(name: string): boolean {
  const lower = name.toLowerCase();
  return CHECK_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Turn a script name into a safe check name (config keys can't contain colons/slashes). */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function checksFromScripts(
  scripts: Record<string, string>,
  pm: PackageManager
): Checks {
  const checks: Checks = {};
  for (const name of Object.keys(scripts)) {
    if (!isCheckScript(name)) continue;
    checks[safeName(name)] = { cmd: `${pm} run ${name}` };
  }
  return checks;
}

/** Build checks for a project directory by inspecting its manifests. */
export function buildChecks(dir: string): Checks {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    const pm = findPackageManager(dir);
    const pkg = safeJson(pkgPath);
    const scripts = pkg && typeof pkg.scripts === "object" ? pkg.scripts : {};
    const checks = checksFromScripts(scripts as Record<string, string>, pm);
    if (Object.keys(checks).length > 0) return checks;
  }

  if (existsSync(join(dir, "Cargo.toml"))) {
    return {
      test: { cmd: "cargo test 2>&1" },
      clippy: { cmd: "cargo clippy 2>&1" }
    };
  }

  if (existsSync(join(dir, "go.mod"))) {
    return { test: { cmd: "go test ./... 2>&1" } };
  }

  if (existsSync(join(dir, "pyproject.toml"))) {
    const py = readFileSync(join(dir, "pyproject.toml"), "utf8");
    const checks: Checks = {};
    if (py.includes("pytest")) checks.test = { cmd: "pytest 2>&1" };
    if (py.includes("ruff")) checks.lint = { cmd: "ruff check . 2>&1" };
    if (py.includes("mypy")) checks.types = { cmd: "mypy . 2>&1" };
    if (Object.keys(checks).length > 0) return checks;
  }

  if (existsSync(join(dir, "Gemfile"))) {
    return {
      test: { cmd: "bundle exec rspec" },
      lint: { cmd: "bundle exec rubocop" }
    };
  }

  return {};
}

export function runInit(dir: string, outPath: string): void {
  const root = resolve(dir);
  const checks = buildChecks(root);
  const projectName = safeName(basename(root)) || "my-project";

  if (Object.keys(checks).length === 0) {
    console.error(
      `[signal-mcp] init: no recognizable test/lint scripts found in ${root}.\n` +
        `Create ${outPath} manually — see signal.config.example.json for reference.`
    );
    return;
  }

  const config = {
    projects: {
      [projectName]: { root, checks }
    }
  };

  if (existsSync(outPath)) {
    console.error(
      `[signal-mcp] init: ${outPath} already exists — not overwriting.\n` +
        `Generated config for '${projectName}':\n${JSON.stringify(config, null, 2)}`
    );
    return;
  }

  writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
  console.error(
    `[signal-mcp] init: wrote ${outPath} with project '${projectName}' ` +
      `(${Object.keys(checks).length} checks). Review it and adjust as needed.`
  );
}

function safeJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
