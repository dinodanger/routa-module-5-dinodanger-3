import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChangeTool } from "../src/tools/apply-change.ts";
import { copyGroupAccessTool } from "../src/tools/copy-group-access.ts";
import { getSettingsTool } from "../src/tools/get-settings.ts";
import { previewChangeTool } from "../src/tools/preview-change.ts";
import { setSessionLengthTool } from "../src/tools/set-session-length.ts";
import { whoCanReachTool } from "../src/tools/who-can-reach.ts";
import { fakePlatform } from "./fake-platform.ts";

const change = { type: "access" as const, group: "contractors", app: "crm", allowed: true };
const idOf = (text: string) => text.match(/Change (\S+)/)![1];

test("get_settings reads with a read-only token", async () => {
  fakePlatform("read");
  assert.match(await getSettingsTool.handler(), /contractors/);
});

test("who_can_reach names the groups", async () => {
  fakePlatform();
  assert.equal(await whoCanReachTool.handler({ app: "documents" }), "documents is reached by: staff");
});

test("preview_change changes nothing and says what it would do", async () => {
  const { patches } = fakePlatform();
  assert.match(await previewChangeTool.handler({ changes: [change] }), /contractors gains crm/);
  assert.equal(patches.length, 0);
});

test("apply_change applies what was shown, once", async () => {
  const { patches } = fakePlatform();
  const id = idOf(await previewChangeTool.handler({ changes: [change] }));
  assert.equal(await applyChangeTool.handler({ id }), "Applied 1 change.");
  assert.deepEqual(patches, [change]);
  await assert.rejects(applyChangeTool.handler({ id }), /No change has been shown/);
});

test("a read-only token can't preview or apply", async () => {
  const { patches } = fakePlatform("read");
  await assert.rejects(previewChangeTool.handler({ changes: [change] }), /read-only/);
  await assert.rejects(applyChangeTool.handler({ id: "anything" }), /read-only/);
  assert.equal(patches.length, 0);
});

test("set_session_length sets the policy", async () => {
  const { patches } = fakePlatform();
  await setSessionLengthTool.handler({ hours: 8 });
  assert.deepEqual(patches, [{ type: "policy", id: "session-length-hours", value: 8 }]);
});

test("copy_group_access shows the change, then applies it", async () => {
  const { patches } = fakePlatform();
  assert.match(await copyGroupAccessTool.handler({ from: "staff", to: "contractors" }), /contractors gains documents/);
  assert.equal(patches.length, 0);
  await copyGroupAccessTool.handler({ from: "staff", to: "contractors", confirm: true });
  assert.equal(patches.length, 1);
});
