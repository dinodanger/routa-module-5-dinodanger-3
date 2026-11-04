import { getSettings } from "../platform.ts";
import { requireToken } from "../token-check.ts";

export const whoCanReachTool = {
  name: "who_can_reach",
  description: "List the groups that reach an application.",
  inputSchema: { type: "object", properties: { app: { type: "string" } }, required: ["app"] },
  async handler({ app }: { app: string }) {
    await requireToken();
    const { access } = await getSettings();
    const groups = access.filter((a) => a.apps.includes(app)).map((a) => a.group);
    return groups.length ? `${app} is reached by: ${groups.join(", ")}` : `No group reaches ${app}.`;
  },
};
