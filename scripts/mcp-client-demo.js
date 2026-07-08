import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

function rule(label) {
  console.log(`\n${"━".repeat(70)}\n${label}\n${"━".repeat(70)}`);
}

function asJson(result) {
  return JSON.parse(result.content[0].text);
}

function shortJson(obj, indent = 2) {
  return JSON.stringify(obj, null, indent);
}

const transport = new StdioClientTransport({
  command: "node",
  args: [resolve("dist/index.js")],
  env: {
    ...process.env,
    SIGNAL_CONFIG: resolve("signal.config.json")
  }
});

const client = new Client({ name: "signal-mcp-demo", version: "1.0.0" });

rule("1) Connecting MCP client over stdio");
await client.connect(transport);
console.log("connected · server: signal-mcp");

rule("2) tools/list");
const { tools } = await client.listTools();
for (const t of tools) {
  console.log(`  - ${t.name}`);
}

rule("3) call list_checks");
const list = await client.callTool({ name: "list_checks", arguments: {} });
console.log(shortJson(asJson(list)));

rule("4) call start_check { name: 'real_tests' }");
const startRes = await client.callTool({
  name: "start_check",
  arguments: { name: "real_tests" }
});
const start = asJson(startRes);
console.log(shortJson(start));

rule("5) poll get_run_status until not 'running'");
let status = "running";
let polls = 0;
while (status === "running") {
  await new Promise((r) => setTimeout(r, 400));
  polls += 1;
  const res = await client.callTool({
    name: "get_run_status",
    arguments: { run_id: start.run_id }
  });
  const meta = asJson(res);
  status = meta.status;
  console.log(`  poll #${polls}: status=${status} duration=${meta.duration_ms ?? "—"}ms`);
}

rule("6) call get_run_summary");
const summaryRes = await client.callTool({
  name: "get_run_summary",
  arguments: { run_id: start.run_id, max_groups: 3, max_occurrences: 2 }
});
console.log(shortJson(asJson(summaryRes)));

rule("7) call list_runs (current session sees the run)");
const runsRes = await client.callTool({
  name: "list_runs",
  arguments: { check: "real_tests" }
});
const runs = asJson(runsRes).runs;
console.log(`  ${runs.length} runs of real_tests on disk; latest: ${runs[0]?.run_id}`);

await client.close();
console.log("\nclosed cleanly · all calls ran on a single MCP session.");
