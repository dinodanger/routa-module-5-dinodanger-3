import { getSettings } from "../platform.ts";
import type { Change } from "../platform.ts";
import { showChange } from "../preview.ts";
import { requireAdmin } from "../token-check.ts";

export const previewChangeTool = {
  name: "preview_change",
  description: "Show what a change to the settings would do, without changing anything. Returns an id for apply_change.",
  inputSchema: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: 'Each is {"type":"access","group","app","allowed"} or {"type":"policy","id","value"}.',
        items: { type: "object" },
      },
    },
    required: ["changes"],
  },
  async handler({ changes }: { changes: Change[] }) {
    await requireAdmin();
    return showChange(changes, await getSettings());
  },
};
