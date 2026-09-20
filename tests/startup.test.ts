import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { explainMissingProject, explainMissingConfig } from "../src/config.js";
import { createUnconfiguredServer, TOOL_NAMES } from "../src/server.js";

const rawConfig = {
  projects: {
    bide: { root: "/home/me/bide", checks: {} },
    lexis: { root: "/home/me/lexis", checks: {} },
  },
} as never;

describe("explainMissingProject", () => {
  it("names the directory that matched nothing", () => {
    expect(explainMissingProject(rawConfig, "/home/me/other")).toContain("/home/me/other");
  });

  it("lists the projects that are configured, so the gap is obvious", () => {
    const message = explainMissingProject(rawConfig, "/home/me/other");
    expect(message).toContain("bide");
    expect(message).toContain("lexis");
  });

  it("says what to do about it", () => {
    expect(explainMissingProject(rawConfig, "/home/me/other")).toContain("signal.config.json");
  });
});

describe("explainMissingConfig", () => {
  it("names the path it looked at", () => {
    expect(explainMissingConfig("/etc/signal.config.json")).toContain("/etc/signal.config.json");
  });
});

async function connectTo(reason: string): Promise<Client> {
  const server = createUnconfiguredServer(reason);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe("unconfigured server", () => {
  it("connects instead of exiting, so the client sees a server rather than a closed pipe", async () => {
    const client = await connectTo("no project matched");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("answers any call with the reason", async () => {
    const client = await connectTo("no project matched /home/me/other");
    for (const name of ["list_checks", "run_check", "get_run_summary"]) {
      const result = await client.callTool({ name, arguments: {} });
      expect(JSON.stringify(result)).toContain("no project matched /home/me/other");
    }
  });
});

describe("TOOL_NAMES", () => {
  it("stays in sync with what the real server registers", () => {
    const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    const registered = [...source.matchAll(/server\.tool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(registered.sort()).toEqual([...TOOL_NAMES].sort());
  });
});
