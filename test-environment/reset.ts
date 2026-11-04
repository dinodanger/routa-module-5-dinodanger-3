// Throws away every change made to the HR and identity platform, and the collect log: npm run test-environment:reset
import { rmSync } from "node:fs";
import { collectLog, dataDir } from "./paths.ts";

rmSync(dataDir, { recursive: true, force: true });
if (!process.env.DATA_DIR) rmSync(collectLog, { force: true });
console.log(`Removed ${dataDir} and the collect log. The test environment starts again from its seed on the next request.`);
