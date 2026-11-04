// A fake platform for the tests: no running service and no token.
import type { Settings } from "../src/platform.ts";

export function fakePlatform(scope: "read" | "admin" = "admin") {
  const settings: Settings = {
    access: [
      { group: "contractors", apps: ["timesheets"] },
      { group: "staff", apps: ["documents", "timesheets"] },
    ],
    policies: [{ id: "session-length-hours", label: "Session length in hours", value: 24 }],
  };
  const patches: unknown[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path === "/admin/v1/whoami") return Response.json({ scope });
    if (init?.method === "PATCH") {
      const { changes } = JSON.parse(String(init.body));
      patches.push(...changes);
      return Response.json({ applied: changes.length, settings });
    }
    return Response.json(settings);
  }) as typeof fetch;
  return { patches };
}
