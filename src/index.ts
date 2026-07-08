#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { loadRawConfig, detectProject, resolveConfig } from "./config.js";
import { Storage } from "./storage.js";
import { Runner } from "./runner.js";
import { createServer } from "./server.js";
import { install } from "./install.js";

const [, , command, ...args] = process.argv;

if (command === "install") {
  const configFlag = args.indexOf("--config");
  const configPath = configFlag !== -1 ? args[configFlag + 1] : null;
  if (!configPath) {
    console.error("Usage: signal-mcp install --config /path/to/signal.config.json");
    process.exit(1);
  }
  install(resolve(configPath));
} else {
  main().catch((err) => {
    console.error("[signal-mcp] fatal:", err);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const configPath = process.env.SIGNAL_CONFIG ?? resolve("signal.config.json");
  const rawConfig = loadRawConfig(configPath);

  const cwd = process.env.SIGNAL_CWD ?? process.cwd();
  const projectName = detectProject(rawConfig, cwd);

  if (!projectName) {
    const available = Object.keys(rawConfig.projects).join(", ");
    throw new Error(
      `No project matched cwd '${cwd}'. Configured projects: ${available}`
    );
  }

  console.error(`[signal-mcp] project: ${projectName}`);

  const config = resolveConfig(rawConfig, projectName);
  const root = resolve(config.root);
  const storage = new Storage(root);
  const runner = new Runner(storage);
  const server = createServer({ config, storage, runner });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
