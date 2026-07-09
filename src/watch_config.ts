import { watch } from "node:fs";
import { loadRawConfig, detectProject, resolveConfig } from "./config.js";
import type { ChecksDeps } from "./checks.js";

export function watchConfig(
  configPath: string,
  projectName: string,
  deps: ChecksDeps
): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(configPath, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        const rawConfig = loadRawConfig(configPath);
        const resolved = resolveConfig(rawConfig, projectName);
        deps.config = resolved;
        console.error("[signal-mcp] config reloaded");
      } catch (err) {
        console.error("[signal-mcp] config reload failed:", (err as Error).message);
      }
    }, 100);
  });

  return () => {
    if (debounce) clearTimeout(debounce);
    watcher.close();
  };
}
