#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve } from "node:path";
import { loadRawConfig, detectProject, resolveConfig, explainMissingProject, explainMissingConfig } from "./config.js";
import { Storage } from "./storage.js";
import { Runner } from "./runner.js";
import { createServer, createUnconfiguredServer } from "./server.js";
import { install } from "./install.js";
import { watchConfig } from "./watch_config.js";
import { autoLoadEnvFiles } from "./env_file.js";
import { runInit } from "./init.js";

const [, , command, ...args] = process.argv;

if (command === "install") {
  const configFlag = args.indexOf("--config");
  const configPath = configFlag !== -1 ? args[configFlag + 1] : null;
  if (!configPath) {
    console.error("Usage: signal-mcp install --config /path/to/signal.config.json");
    process.exit(1);
  }
  install(resolve(configPath));
} else if (command === "init") {
  const dirFlag = args.indexOf("--dir");
  const dir = dirFlag !== -1 ? args[dirFlag + 1] : process.cwd();
  const outFlag = args.indexOf("--out");
  const outPath = outFlag !== -1 ? args[outFlag + 1] : resolve(dir, "signal.config.json");
  runInit(dir, outPath);
} else {
  main().catch((err) => {
    console.error("[signal-mcp] fatal:", err);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const configPath = process.env.SIGNAL_CONFIG ?? resolve("signal.config.json");
  autoLoadEnvFiles(configPath);

  const server = buildServer(configPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// A startup problem must not take the process down with it. The client would
// only see CONNECTION_CLOSED, which names no cause and sends whoever hit it
// digging through the server by hand. Serve the explanation instead.
function buildServer(configPath: string) {
  let rawConfig;
  try {
    rawConfig = loadRawConfig(configPath);
  } catch (err) {
    const reason = explainMissingConfig(configPath, err);
    console.error(`[signal-mcp] ${reason}`);
    return createUnconfiguredServer(reason);
  }

  const cwd = process.env.SIGNAL_CWD ?? process.cwd();
  const projectName = detectProject(rawConfig, cwd);
  if (!projectName) {
    const reason = explainMissingProject(rawConfig, cwd);
    console.error(`[signal-mcp] ${reason}`);
    return createUnconfiguredServer(reason);
  }

  console.error(`[signal-mcp] project: ${projectName}`);

  const config = resolveConfig(rawConfig, projectName);
  const root = resolve(config.root);
  const storage = new Storage(root);
  const runner = new Runner(storage);
  const deps = { config, storage, runner };
  const server = createServer(deps);
  watchConfig(configPath, projectName, deps);
  return server;
}
