// Where the test environment keeps things. SEED_DIR and DATA_DIR override the defaults.
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export const seedDir = resolve(process.env.SEED_DIR || join(here, "seed"));
export const dataDir = resolve(process.env.DATA_DIR || join(here, ".data"));
export const tokenFile = join(homedir(), ".routa", "token");
export const readonlyTokenFile = join(homedir(), ".routa", "token-readonly");
export const collectLog = join(here, "collect.log");
