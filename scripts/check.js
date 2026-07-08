#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const checkName = process.argv[2];
if (!checkName) {
  console.error("usage: node scripts/check.js <check_name>  (e.g. real_tests, typecheck)");
  process.exit(2);
}

const SIGNAL_ROOT = new URL("..", import.meta.url).pathname;

const transport = new StdioClientTransport({
  command: "node",
  args: [resolve(SIGNAL_ROOT, "dist/index.js")],
  env: {
    ...process.env,
    SIGNAL_CONFIG: process.env.SIGNAL_CONFIG ?? resolve(SIGNAL_ROOT, "signal.config.json"),
    SIGNAL_CWD: process.env.SIGNAL_CWD ?? process.cwd()
  }
});
const client = new Client({ name: "signal-self-check", version: "1.0.0" });
await client.connect(transport);

function asJson(r) {
  return JSON.parse(r.content[0].text);
}

const start = asJson(
  await client.callTool({ name: "start_check", arguments: { name: checkName } })
);
process.stdout.write(`▶ ${checkName}  run_id=${start.run_id}  `);

let status = "running";
const t0 = Date.now();
while (status === "running") {
  await new Promise((r) => setTimeout(r, 400));
  process.stdout.write(".");
  const r = await client.callTool({
    name: "get_run_status",
    arguments: { run_id: start.run_id }
  });
  status = asJson(r).status;
}
process.stdout.write(` ${status} (${Date.now() - t0}ms)\n`);

const summary = asJson(
  await client.callTool({
    name: "get_run_summary",
    arguments: { run_id: start.run_id, max_groups: 5, max_occurrences: 3 }
  })
);

console.log(`\n${summary.summary}`);
if (summary.error_count > 0) {
  console.log(`\nTop groups:`);
  for (const g of summary.top_groups) {
    console.log(`  ${g.symbol ?? "(no symbol)"} × ${g.count} (${g.files.length} file${g.files.length === 1 ? "" : "s"})`);
    for (const occ of g.occurrences.slice(0, 3)) {
      console.log(`    ${occ.file}:${occ.line ?? "?"}:${occ.column ?? "?"}`);
    }
  }
}

await client.close();
process.exit(summary.status === "completed" ? 0 : 1);
