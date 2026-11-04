// Creates the two tokens, if they aren't there yet, without printing them: npm run test-environment:tokens
import { ensureToken } from "./server.ts";
import { readonlyTokenFile, tokenFile } from "./paths.ts";

ensureToken(tokenFile);
ensureToken(readonlyTokenFile, "rtr_");
console.log(`Tokens are in ${tokenFile} (admin) and ${readonlyTokenFile} (read-only).`);
