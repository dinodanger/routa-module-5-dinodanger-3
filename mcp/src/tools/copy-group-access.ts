import { getSettings, patchSettings } from "../platform.ts";
import type { Change } from "../platform.ts";
import { showChange } from "../preview.ts";

export const copyGroupAccessTool = {
  name: "copy_group_access",
  description: "Give one group the same applications as another. Shows the change first; call again with confirm: true to apply it.",
  inputSchema: {
    type: "object",
    properties: { from: { type: "string" }, to: { type: "string" }, confirm: { type: "boolean" } },
    required: ["from", "to"],
  },
  async handler({ from, to, confirm }: { from: string; to: string; confirm?: boolean }) {
    const settings = await getSettings();
    const source = settings.access.find((a) => a.group === from);
    const target = settings.access.find((a) => a.group === to);
    if (!source || !target) throw new Error(`No group called ${source ? to : from}.`);
    const changes: Change[] = source.apps.filter((app) => !target.apps.includes(app)).map((app) => ({ type: "access", group: to, app, allowed: true }));
    if (!confirm) return showChange(changes, settings);
    await patchSettings(changes);
    return `${to} now has the same applications as ${from}.`;
  },
};
