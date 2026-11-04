import assert from "node:assert/strict";
import { test } from "node:test";
import { answer } from "../src/server.ts";
import { fakePlatform } from "./fake-platform.ts";

test("initialize answers with the client's protocol version", async () => {
  const result = (await answer({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as { protocolVersion: string };
  assert.equal(result.protocolVersion, "2025-06-18");
});

test("tools/list names every tool", async () => {
  const { tools } = (await answer({ id: 1, method: "tools/list" })) as { tools: { name: string }[] };
  assert.deepEqual(tools.map((t) => t.name).sort(), ["apply_change", "copy_group_access", "get_settings", "preview_change", "set_session_length", "who_can_reach"]);
});

test("a refused call comes back as a tool error", async () => {
  fakePlatform("read");
  const result = (await answer({ id: 1, method: "tools/call", params: { name: "preview_change", arguments: { changes: [] } } })) as { isError: boolean };
  assert.equal(result.isError, true);
});
