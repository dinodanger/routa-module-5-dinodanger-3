// A live run, as IT would: starts the server against the running test environment and talks MCP to it.
// npm run live-check, with ROUTA_TOKEN and ROUTA_READONLY_TOKEN set.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

if (!process.env.ROUTA_TOKEN || !process.env.ROUTA_READONLY_TOKEN) {
  console.error("Set ROUTA_TOKEN and ROUTA_READONLY_TOKEN first.");
  process.exit(2);
}

async function session(token: string | undefined) {
  const server = spawn("node", ["mcp/src/server.ts"], { env: { ...process.env, MCP_TOKEN: token }, stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: server.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const call = async (method: string, params = {}) => {
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) + "\n");
    return JSON.parse((await lines.next()).value).result;
  };
  await call("initialize", { protocolVersion: "2025-06-18" });
  return { tool: (name: string, args = {}) => call("tools/call", { name, arguments: args }), stop: () => server.kill() };
}

const change = [{ type: "policy", id: "audit-log-days", value: 366 }];
const failures: string[] = [];

const admin = await session(process.env.ROUTA_TOKEN);
const read = await admin.tool("get_settings");
if (read.isError) failures.push(`get_settings: ${read.content[0].text}`);
const shown = await admin.tool("preview_change", { changes: change });
if (shown.isError || !/audit-log-days/.test(shown.content[0].text)) failures.push(`preview_change: ${shown.content[0].text}`);
admin.stop();

const readOnly = await session(process.env.ROUTA_READONLY_TOKEN);
const refused = await readOnly.tool("preview_change", { changes: change });
if (!refused.isError) failures.push("a read-only token got through preview_change");
readOnly.stop();

if (failures.length) {
  console.log(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("The live run passed: an admin token reads and previews, and a read-only token is refused.");
}
