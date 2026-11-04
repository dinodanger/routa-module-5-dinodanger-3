// Shows a change in plain words and keeps it under an id, so what is applied is what was shown.
import { randomUUID } from "node:crypto";
import type { Change, Settings } from "./platform.ts";

const shown = new Map<string, Change[]>();

function inWords(change: Change, settings: Settings): string {
  if (change.type === "access") return `${change.group} ${change.allowed ? "gains" : "loses"} ${change.app}`;
  const policy = settings.policies.find((p) => p.id === change.id);
  return `${change.id} goes from ${JSON.stringify(policy?.value)} to ${JSON.stringify(change.value)}`;
}

export function showChange(changes: Change[], settings: Settings): string {
  const id = randomUUID();
  shown.set(id, changes);
  return [`Change ${id} would do this:`, ...changes.map((c) => `- ${inWords(c, settings)}`), "Nothing has changed yet. Apply it with apply_change and this id."].join("\n");
}

export function takeChange(id: string): Change[] {
  const changes = shown.get(id);
  if (!changes) throw new Error(`No change has been shown with id ${id}. Preview it first.`);
  shown.delete(id);
  return changes;
}
