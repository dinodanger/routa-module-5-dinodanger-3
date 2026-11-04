// Calls to the identity platform's admin API, with the token of whoever is using the server.
export type Change =
  | { type: "access"; group: string; app: string; allowed: boolean }
  | { type: "policy"; id: string; value: boolean | number | string };
export type Settings = {
  access: { group: string; apps: string[] }[];
  policies: { id: string; label: string; value: boolean | number | string }[];
};

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const url = process.env.ROUTA_URL || "http://localhost:4686";
  const res = await fetch(url + path, { ...init, headers: { Authorization: `Bearer ${process.env.MCP_TOKEN ?? ""}` } });
  const body = (await res.json()) as { detail?: string };
  if (!res.ok) throw new Error(`The platform answered ${res.status}: ${body.detail ?? "no detail"}`);
  return body;
}

export const getSettings = () => call("/admin/v1/settings") as Promise<Settings>;
export const whoami = () => call("/admin/v1/whoami") as Promise<{ scope: "read" | "admin" }>;
export const patchSettings = (changes: Change[]) =>
  call("/admin/v1/settings", { method: "PATCH", body: JSON.stringify({ changes }) }) as Promise<{ applied: number; settings: Settings }>;
