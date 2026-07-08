import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLAUDE_JSON = join(homedir(), ".claude.json");

export function install(configPath: string): void {
  if (!existsSync(configPath)) {
    console.error(`Error: config file not found at ${configPath}`);
    process.exit(1);
  }

  // Resolve the signal-mcp binary path (where this script lives)
  const binPath = resolve(fileURLToPath(import.meta.url), "../../dist/index.js");

  const claudeJson: Record<string, unknown> = existsSync(CLAUDE_JSON)
    ? JSON.parse(readFileSync(CLAUDE_JSON, "utf8"))
    : {};

  if (!claudeJson.mcpServers || typeof claudeJson.mcpServers !== "object") {
    claudeJson.mcpServers = {};
  }

  const servers = claudeJson.mcpServers as Record<string, unknown>;

  if (servers["signal"]) {
    console.log("signal-mcp is already registered in ~/.claude.json — updating config path.");
  }

  servers["signal"] = {
    type: "stdio",
    command: "node",
    args: [binPath],
    env: {
      SIGNAL_CONFIG: configPath
    }
  };

  writeFileSync(CLAUDE_JSON, JSON.stringify(claudeJson, null, 2));
  console.log(`✓ signal-mcp registered in ~/.claude.json`);
  console.log(`  config: ${configPath}`);
  console.log(`\nRestart Claude Code to apply changes.`);
}
