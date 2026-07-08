import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;
const ADAPTER = z.enum([
  "phpstan",
  "generic",
  "eslint",
  "vitest",
  "phpunit",
  "pest",
  "behat",
  "junit",
  "phpspec",
  "symfony_log",
  "pytest",
  "biome",
  "json_log",
  "bun_test",
  "jest",
  "cypress",
  "playwright",
  "rspec",
  "go_test"
]);
const ENV = z.record(z.string());

const StepSchema = z
  .object({
    name: z.string().min(1).regex(SAFE_NAME, "step name must match /^[a-zA-Z0-9_-]+$/"),
    cmd: z.string().min(1),
    cwd: z.string().optional(),
    timeout_ms: z.number().int().positive().default(60_000),
    adapter: ADAPTER.default("generic"),
    env: ENV.optional(),
    on_failure: z.string().min(1).optional(),
    strip_path_prefix: z.string().min(1).optional()
  })
  .strict();

const SingleCheckSchema = z
  .object({
    cmd: z.string().min(1),
    cwd: z.string().optional(),
    timeout_ms: z.number().int().positive().default(60_000),
    adapter: ADAPTER.default("generic"),
    env: ENV.optional(),
    on_failure: z.string().min(1).optional(),
    strip_path_prefix: z.string().min(1).optional()
  })
  .strict();

const MultiStepCheckSchema = z
  .object({
    steps: z.array(StepSchema).min(1),
    fail_fast: z.boolean().default(true),
    timeout_ms: z.number().int().positive().optional(),
    cwd: z.string().optional(),
    env: ENV.optional()
  })
  .strict()
  .refine(
    (data) => {
      const seen = new Set<string>();
      for (const s of data.steps) {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
      }
      return true;
    },
    { message: "duplicate step name within a check" }
  );

const CheckSchema = z.union([SingleCheckSchema, MultiStepCheckSchema], {
  errorMap: () => ({
    message: "check must have either 'cmd' (single) or 'steps' (multi-step), not both, not neither"
  })
});

const ProjectSchema = z.object({
  root: z.string().min(1),
  checks: z.record(CheckSchema)
});

const RawConfigSchema = z.object({
  projects: z.record(ProjectSchema)
});

// Resolved flat config used internally after project detection
export const ConfigSchema = z.object({
  root: z.string().default("."),
  checks: z.record(CheckSchema)
});

export type Step = z.infer<typeof StepSchema>;
export type SingleCheck = z.infer<typeof SingleCheckSchema>;
export type MultiStepCheck = z.infer<typeof MultiStepCheckSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;

export function isMultiStep(check: Check): check is MultiStepCheck {
  return "steps" in check;
}

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw);
}

export function parseRawConfig(raw: unknown): RawConfig {
  return RawConfigSchema.parse(raw);
}

export function detectProject(rawConfig: RawConfig, cwd: string): string | null {
  const resolvedCwd = resolve(cwd);
  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const [name, project] of Object.entries(rawConfig.projects)) {
    const projectRoot = resolve(project.root);
    if (
      (resolvedCwd === projectRoot || resolvedCwd.startsWith(projectRoot + "/")) &&
      projectRoot.length > bestLength
    ) {
      bestMatch = name;
      bestLength = projectRoot.length;
    }
  }

  return bestMatch;
}

export function resolveConfig(rawConfig: RawConfig, projectName: string): Config {
  const project = rawConfig.projects[projectName];
  if (!project) throw new Error(`Project '${projectName}' not found in config`);
  return ConfigSchema.parse({ root: project.root, checks: project.checks });
}

export function loadRawConfig(path: string): RawConfig {
  const abs = resolve(path);
  const raw = readFileSync(abs, "utf8");
  return parseRawConfig(JSON.parse(raw));
}
