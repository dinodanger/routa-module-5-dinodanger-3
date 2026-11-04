import { getSettings } from "../platform.ts";
import { requireToken } from "../token-check.ts";

export const getSettingsTool = {
  name: "get_settings",
  description: "Read the settings: which groups reach which applications, and the security policies.",
  inputSchema: { type: "object", properties: {} },
  async handler() {
    await requireToken();
    return JSON.stringify(await getSettings(), null, 1);
  },
};
