// Starts Routa's HR and identity platform: npm run test-environment
import { createTestEnvironment, ensureToken, loadState } from "./server.ts";
import { collectLog, dataDir, readonlyTokenFile, seedDir, tokenFile } from "./paths.ts";

const port = Number(process.env.PORT || 4686);

const { created } = ensureToken(tokenFile);
ensureToken(readonlyTokenFile, "rtr_");
const opts = { seedDir, dataDir, tokenFile, readonlyTokenFile, collectLog, log: (line: string) => console.log(line) };

// Loads the seed on first start, so a broken seed shows now rather than on the first request.
try {
  loadState(opts);
} catch (err) {
  console.error(`Could not load the test environment's state: ${(err as Error).message}`);
  process.exit(1);
}

const server = createTestEnvironment(opts);

server.on("error", (err: { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Is the test environment already running?`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  console.log(`Routa HR and identity platform on http://localhost:${actual}`);
  console.log(`Changes are kept in ${dataDir}. npm run test-environment:reset starts again from the seed.`);
  console.log(`Settings page: http://localhost:${actual}/admin/settings`);
  console.log(`Tokens: ${created ? "created in" : "read from"} ${tokenFile} (admin) and ${readonlyTokenFile} (read-only)`);
});
