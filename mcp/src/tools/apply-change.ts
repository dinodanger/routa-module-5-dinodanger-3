import { patchSettings } from "../platform.ts";
import { takeChange } from "../preview.ts";
import { requireAdmin } from "../token-check.ts";

export const applyChangeTool = {
  name: "apply_change",
  description: "Apply a change that preview_change has shown, by its id.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  async handler({ id }: { id: string }) {
    await requireAdmin();
    const { applied } = await patchSettings(takeChange(id));
    return `Applied ${applied} change${applied === 1 ? "" : "s"}.`;
  },
};
