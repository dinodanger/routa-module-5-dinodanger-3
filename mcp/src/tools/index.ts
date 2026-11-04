import { applyChangeTool } from "./apply-change.ts";
import { copyGroupAccessTool } from "./copy-group-access.ts";
import { getSettingsTool } from "./get-settings.ts";
import { previewChangeTool } from "./preview-change.ts";
import { setSessionLengthTool } from "./set-session-length.ts";
import { whoCanReachTool } from "./who-can-reach.ts";

export const tools = [getSettingsTool, whoCanReachTool, previewChangeTool, applyChangeTool, setSessionLengthTool, copyGroupAccessTool];
