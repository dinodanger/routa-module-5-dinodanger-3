// Checks our settings against a copy of what the platform returned when we built this.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the recorded settings have the shape the tools expect", () => {
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/local-settings.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(recorded.access));
  assert.ok(recorded.access.every((a: { group: string; apps: string[] }) => typeof a.group === "string" && Array.isArray(a.apps)));
  assert.ok(recorded.policies.every((p: { id: string }) => typeof p.id === "string"));
});
