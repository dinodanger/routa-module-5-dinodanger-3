import { getSettings, patchSettings } from "../platform.ts";
import { showChange } from "../preview.ts";
import { requireAdmin } from "../token-check.ts";

export const setSessionLengthTool = {
  name: "set_session_length",
  description: "Set how many hours a session lasts. Shows the change first; call again with confirm: true to apply it.",
  inputSchema: {
    type: "object",
    properties: { hours: { type: "number" }, confirm: { type: "boolean" } },
    required: ["hours"],
  },
  async handler({ hours, confirm }: { hours: number; confirm?: boolean }) {
    await requireAdmin();
    const changes = [{ type: "policy" as const, id: "session-length-hours", value: hours }];
    if (!confirm) return showChange(changes, await getSettings());
    await patchSettings(changes);
    return `Sessions now last ${hours} hours.`;
  },
};
