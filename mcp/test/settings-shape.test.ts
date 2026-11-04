// Checks our settings against a copy of what the platform returned when we built this.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// The recording is ignored by git (fixtures/local-*), so it exists only where someone recorded it. Skip elsewhere, e.g. in CI.
const recording = new URL("./fixtures/local-settings.json", import.meta.url);

test("the recorded settings have the shape the tools expect", { skip: !existsSync(recording) && "no local recording" }, () => {
  const recorded = JSON.parse(readFileSync(recording, "utf8"));
  assert.ok(Array.isArray(recorded.access));
  assert.ok(recorded.access.every((a: { group: string; apps: string[] }) => typeof a.group === "string" && Array.isArray(a.apps)));
  assert.ok(recorded.policies.every((p: { id: string }) => typeof p.id === "string"));
});
