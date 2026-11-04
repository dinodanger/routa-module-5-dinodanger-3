// The MCP server: newline-delimited JSON-RPC over stdio. Logs go to stderr, as stdout belongs to the protocol.
import { createInterface } from "node:readline";
import { tools } from "./tools/index.ts";

type Request = { id?: number | string; method: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } };

export async function answer(req: Request): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return { protocolVersion: req.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "routa-identity", version: "0.1.0" } };
    case "ping":
      return {};
    case "tools/list":
      return { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case "tools/call": {
      const tool = tools.find((t) => t.name === req.params?.name);
      if (!tool) throw new Error(`No tool called ${req.params?.name}.`);
      try {
        return { content: [{ type: "text", text: await tool.handler((req.params?.arguments ?? {}) as never) }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }], isError: true };
      }
    }
    default:
      throw new Error(`Unknown method ${req.method}.`);
  }
}

if (import.meta.main ?? process.argv[1]?.endsWith("server.ts")) {
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    const req = JSON.parse(line) as Request;
    if (req.id === undefined) continue;
    try {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: await answer(req) }));
    } catch (err) {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: (err as Error).message } }));
    }
  }
}
