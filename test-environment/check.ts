// Says whether Routa's HR and identity platform is up and the token file exists, without reading the token.
import { existsSync } from "node:fs";
import { tokenFile } from "./paths.ts";

const url = `http://localhost:${process.env.PORT || 4686}`;

let running = false;
try {
  const res = await fetch(url + "/scim/v2/Users");
  running = res.status === 401 || res.ok;
} catch {}

console.log(`Routa's HR and identity platform at ${url}: ${running ? "running" : "not running (start it with npm run test-environment)"}`);
console.log(`Token file ${tokenFile}: ${existsSync(tokenFile) ? "exists" : "missing (npm run test-environment creates it)"}`);
process.exit(running && existsSync(tokenFile) ? 0 : 1);
