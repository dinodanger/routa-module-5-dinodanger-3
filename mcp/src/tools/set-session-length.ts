import { patchSettings } from "../platform.ts";
import { requireAdmin } from "../token-check.ts";

export const setSessionLengthTool = {
  name: "set_session_length",
  description: "Set how many hours a session lasts.",
  inputSchema: { type: "object", properties: { hours: { type: "number" } }, required: ["hours"] },
  async handler({ hours }: { hours: number }) {
    await requireAdmin();
    await patchSettings([{ type: "policy", id: "session-length-hours", value: hours }]);
    return `Sessions now last ${hours} hours.`;
  },
};
