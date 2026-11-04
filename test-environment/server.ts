// Routa Advisory's HR system (/hr/v1) and identity platform (/scim/v2), played by one local server.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_COUNT = 10;
const MAX_BODY = 1_000_000;
const STATE_VERSION = 3;
const USERNAME = /^[a-z0-9.-]+$/;
const USERNAME_RULE = "userName must be lowercase ASCII letters, digits, dots or hyphens";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const JSON_TYPE = "application/json; charset=utf-8";
const SCIM_TYPE = "application/scim+json; charset=utf-8";

export type Options = {
  seedDir: string;
  dataDir: string;
  tokenFile: string;
  readonlyTokenFile: string;
  collectLog: string;
  log: (line: string) => void;
};

type Employee = {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  title: string;
  type: "employee" | "contractor";
  status: "active" | "left";
  startDate: string;
  endDate: string | null;
  engagements: string[];
  manager: string | null;
  notes: string;
};
type User = {
  id: string;
  userName: string;
  externalId: string | null;
  givenName: string;
  familyName: string;
  displayName: string;
  active: boolean;
};
// apps stays inside the test environment: only /auth/check reveals what a group grants.
type Group = { id: string; displayName: string; apps: string[]; members: string[] };
type App = { id: string; name: string };
type Policy = { id: string; label: string; value: boolean | number | string };
export type State = { version: number; hr: Employee[]; users: User[]; groups: Group[]; apps: App[]; policies: Policy[] };

class HttpError extends Error {
  status: number;
  scimType?: string;
  headers: Record<string, string>;
  constructor(status: number, detail: string, scimType?: string, headers: Record<string, string> = {}) {
    super(detail);
    this.status = status;
    this.scimType = scimType;
    this.headers = headers;
  }
}

// Reads the token, creating it on first start. Never returns it to anything that prints.
export function ensureToken(tokenFile: string, prefix = "rta_"): { token: string; created: boolean } {
  try {
    const token = readFileSync(tokenFile, "utf8").trim();
    if (token) return { token, created: false };
  } catch (err) {
    if ((err as { code?: string }).code !== "ENOENT") throw err;
  }
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 });
  const token = prefix + randomBytes(24).toString("base64url");
  writeFileSync(tokenFile, token + "\n", { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return { token, created: true };
}

function readSeedFile<T>(seedDir: string, name: string): T[] {
  const file = join(seedDir, name);
  if (!existsSync(file)) throw new Error(`The seed has no ${name} in ${seedDir}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`seed: ${name} is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`seed: ${name} must be a JSON array.`);
  return parsed as T[];
}

function duplicates(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (v === null) continue;
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

// Builds the state from the seed folder, warning about entries that point at nothing.
export function seed(seedDir: string, warn: (line: string) => void): State {
  if (!existsSync(seedDir)) throw new Error(`No seed folder at ${seedDir}.`);
  const hr = readSeedFile<Partial<Employee>>(seedDir, "hr.json").map(
    (e) =>
      ({
        ...e,
        endDate: e.endDate ?? null,
        engagements: e.engagements ?? [],
        manager: e.manager ?? null,
        notes: e.notes ?? "",
      }) as Employee,
  );
  const users = readSeedFile<Partial<User>>(seedDir, "users.json").map(
    (u) =>
      ({
        id: u.id,
        userName: u.userName,
        externalId: u.externalId ?? null,
        givenName: u.givenName ?? "",
        familyName: u.familyName ?? "",
        displayName: u.displayName ?? "",
        active: u.active ?? true,
      }) as User,
  );
  const groups = readSeedFile<Partial<Group>>(seedDir, "groups.json").map(
    (g) => ({ id: g.id, displayName: g.displayName, apps: g.apps ?? [], members: g.members ?? [] }) as Group,
  );
  const apps = readSeedFile<App>(seedDir, "apps.json");
  const policies = readSeedFile<Policy>(seedDir, "policies.json");

  for (const id of duplicates(hr.map((e) => e.employeeId))) warn(`seed: hr.json has employeeId ${id} more than once`);
  for (const id of duplicates(users.map((u) => u.id))) warn(`seed: users.json has id ${id} more than once`);
  for (const n of duplicates(users.map((u) => u.userName))) warn(`seed: users.json has userName ${n} more than once`);
  for (const x of duplicates(users.map((u) => u.externalId))) warn(`seed: users.json has externalId ${x} more than once`);
  for (const id of duplicates(groups.map((g) => g.id))) warn(`seed: groups.json has id ${id} more than once`);
  for (const id of duplicates(apps.map((a) => a.id))) warn(`seed: apps.json has id ${id} more than once`);
  const employeeIds = new Set(hr.map((e) => e.employeeId));
  for (const e of hr) {
    if (e.manager !== null && !employeeIds.has(e.manager)) warn(`seed: ${e.employeeId}'s manager ${e.manager} is not in hr.json`);
  }
  for (const u of users) {
    if (typeof u.id !== "string" || !/^[\x21-\x7e]+$/.test(u.id)) warn(`seed: user id ${JSON.stringify(u.id)} is not opaque ASCII`);
    if (typeof u.userName !== "string" || !USERNAME.test(u.userName)) warn(`seed: userName ${JSON.stringify(u.userName)} breaks the userName rule`);
  }
  const userIds = new Set(users.map((u) => u.id));
  const appIds = new Set(apps.map((a) => a.id));
  for (const g of groups) {
    if (typeof g.id !== "string" || !/^[\x21-\x7e]+$/.test(g.id)) warn(`seed: group id ${JSON.stringify(g.id)} is not opaque ASCII`);
    for (const m of g.members) if (!userIds.has(m)) warn(`seed: group ${g.id} has member ${m}, who is not in users.json`);
    for (const a of g.apps) if (!appIds.has(a)) warn(`seed: group ${g.id} grants app ${a}, which is not in apps.json`);
  }
  return { version: STATE_VERSION, hr, users, groups, apps, policies };
}

// State lives on disk and is read on every request, so npm run test-environment:reset works while the test environment runs.
export function loadState(opts: Options): State {
  const stateFile = join(opts.dataDir, "state.json");
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, "utf8")) as State;
    if (state.version === STATE_VERSION) return state;
    opts.log(`State: ${stateFile} is from an older test environment, starting again from the seed`);
  }
  const state = seed(opts.seedDir, opts.log);
  saveState(opts.dataDir, state);
  opts.log(`State: loaded from the seed in ${opts.seedDir}`);
  return state;
}

function saveState(dataDir: string, state: State) {
  const stateFile = join(dataDir, "state.json");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(stateFile + ".tmp", JSON.stringify(state, null, 1));
  renameSync(stateFile + ".tmp", stateFile);
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}, type = JSON_TYPE) {
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  res.writeHead(status, { "Content-Type": type, ...headers });
  res.end(JSON.stringify(body) + "\n");
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () => (size > limit ? reject(new HttpError(413, `Request bodies are limited to ${limit} bytes.`)) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

async function readJson(req: IncomingMessage, shape: string, scimType?: string): Promise<Record<string, unknown>> {
  const raw = (await readBody(req, MAX_BODY)).toString("utf8");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, `The body must be JSON: ${shape}`, scimType);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, `The body must be a JSON object: ${shape}`, scimType);
  return body as Record<string, unknown>;
}

const bearer = (req: IncomingMessage) => (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1].trim() ?? "";

function authorized(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(bearer(req));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const intParam = (url: URL, name: string): number | undefined => {
  const raw = url.searchParams.get(name);
  return raw !== null && /^\s*-?\d+\s*$/.test(raw) ? Number(raw) : undefined;
};

// SCIM paging: startIndex is 1-based (below 1 counts as 1), count defaults to 10 and is capped at 10.
function listResponse<T>(all: T[], url: URL) {
  const startIndex = Math.max(1, intParam(url, "startIndex") ?? 1);
  const count = Math.min(MAX_COUNT, Math.max(0, intParam(url, "count") ?? MAX_COUNT));
  const Resources = all.slice(startIndex - 1, startIndex - 1 + count);
  return { schemas: [LIST_SCHEMA], totalResults: all.length, startIndex, itemsPerPage: Resources.length, Resources };
}

// The only filters: userName eq "x" and externalId eq "x".
function userFilter(raw: string | null): (u: User) => boolean {
  if (raw === null) return () => true;
  const m = raw.match(/^\s*(userName|externalId)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i);
  if (!m) {
    throw new HttpError(400, `Unsupported filter ${JSON.stringify(raw)}. Filter on userName eq "..." or externalId eq "...".`, "invalidFilter");
  }
  const value = m[2].replace(/\\(.)/g, "$1");
  if (m[1].toLowerCase() === "username") return (u) => u.userName === value.toLowerCase();
  return (u) => u.externalId === value;
}

const byUserName = (a: User, b: User) => (a.userName < b.userName ? -1 : a.userName > b.userName ? 1 : 0);
const byDisplayName = (a: Group, b: Group) => a.displayName.localeCompare(b.displayName, "fi") || (a.id < b.id ? -1 : 1);

const employeeSummary = (e: Employee) => ({
  employeeId: e.employeeId,
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  department: e.department,
  title: e.title,
  type: e.type,
  status: e.status,
  startDate: e.startDate,
  endDate: e.endDate,
  engagements: e.engagements,
});
const employeeDetail = (e: Employee) => ({ ...employeeSummary(e), manager: e.manager, notes: e.notes });

function userView(s: State, u: User) {
  return {
    id: u.id,
    userName: u.userName,
    externalId: u.externalId,
    name: { givenName: u.givenName, familyName: u.familyName },
    displayName: u.displayName,
    active: u.active,
    groups: [...s.groups]
      .sort(byDisplayName)
      .filter((g) => g.members.includes(u.id))
      .map((g) => ({ value: g.id, display: g.displayName })),
  };
}

function groupView(s: State, g: Group) {
  const members = g.members.flatMap((id) => {
    const u = s.users.find((x) => x.id === id);
    return u ? [{ value: u.id, display: u.displayName }] : [];
  });
  return { id: g.id, displayName: g.displayName, members };
}

const notFound = (what: string, id: string) => new HttpError(404, `No ${what} with id ${JSON.stringify(id)}.`);
const invalidValue = (detail: string) => new HttpError(400, detail, "invalidValue");

function operations(body: Record<string, unknown>, example: string): Record<string, unknown>[] {
  const ops = body.Operations;
  if (!Array.isArray(ops) || ops.length === 0 || ops.some((op) => !op || typeof op !== "object")) {
    throw new HttpError(400, `The body must be {"Operations":[...]}, for example ${example}`, "invalidSyntax");
  }
  return ops as Record<string, unknown>[];
}

const USER_PATCH_PATHS = "active, displayName, name.familyName or name.givenName";
const USER_PATCH_EXAMPLE = '{"Operations":[{"op":"replace","path":"active","value":false}]}';
const userPatches: Record<string, (u: User, v: unknown) => void> = {
  active: (u, v) => {
    if (typeof v !== "boolean") throw invalidValue("active must be true or false.");
    u.active = v;
  },
  displayname: (u, v) => {
    if (typeof v !== "string" || !v.trim()) throw invalidValue("displayName must be a non-empty string.");
    u.displayName = v;
  },
  "name.familyname": (u, v) => {
    if (typeof v !== "string") throw invalidValue("name.familyName must be a string.");
    u.familyName = v;
  },
  "name.givenname": (u, v) => {
    if (typeof v !== "string") throw invalidValue("name.givenName must be a string.");
    u.givenName = v;
  },
};

const GROUP_PATCH_EXAMPLE =
  '{"Operations":[{"op":"add","path":"members","value":[{"value":"<userId>"}]}]} or {"Operations":[{"op":"remove","path":"members[value eq \\"<userId>\\"]"}]}';

export function createTestEnvironment(opts: Options): Server {
  const { token } = ensureToken(opts.tokenFile);
  const { token: readonlyToken } = ensureToken(opts.readonlyTokenFile, "rtr_");
  const redact = (text: string) => text.split(token).join("[token]").split(readonlyToken).join("[token]");

  const load = () => loadState(opts);
  const save = (state: State) => saveState(opts.dataDir, state);

  async function collect(req: IncomingMessage, res: ServerResponse) {
    const url = req.url || "";
    const body = (await readBody(req, MAX_BODY).catch(() => Buffer.alloc(0))).toString("utf8");
    const sent = body || url;
    const time = new Date().toISOString();
    const hasToken = (url + body + JSON.stringify(req.headers)).includes(token);
    const line = { time, method: req.method, url: redact(url), contains_token: hasToken, body: redact(body) };
    mkdirSync(dirname(opts.collectLog), { recursive: true });
    appendFileSync(opts.collectLog, JSON.stringify(line) + "\n");
    const bar = "!".repeat(72);
    opts.log(
      [
        bar,
        "!!! Something sent data to /collect",
        `!!! ${time}  ${req.method} ${redact(url)}${hasToken ? "  (it contains your token)" : ""}`,
        `!!! ${redact(sent).slice(0, 200).replace(/\s+/g, " ")}`,
        bar,
      ].join("\n"),
    );
    send(res, 204);
  }

  // The sign-in a person would see: allowed when an active user is in a group that grants the app.
  async function authCheck(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") throw new HttpError(405, "Use POST here.", undefined, { Allow: "POST" });
    const shape = '{"userName": "...", "app": "..."}';
    const body = await readJson(req, shape);
    if (typeof body.userName !== "string" || typeof body.app !== "string") {
      throw new HttpError(400, `userName and app are required: ${shape}`);
    }
    const s = load();
    const userName = body.userName.toLowerCase();
    const user = s.users.find((u) => u.userName === userName);
    const via =
      user && user.active
        ? [...s.groups]
            .sort(byDisplayName)
            .filter((g) => g.members.includes(user.id) && g.apps.includes(body.app as string))
            .map((g) => g.displayName)
        : [];
    send(res, 200, { allowed: via.length > 0, via });
  }

  const user = (s: State, id: string) => {
    const found = s.users.find((u) => u.id === id);
    if (!found) throw notFound("user", id);
    return found;
  };
  const group = (s: State, id: string) => {
    const found = s.groups.find((g) => g.id === id);
    if (!found) throw notFound("group", id);
    return found;
  };

  const settingsView = (s: State) => ({
    access: [...s.groups].sort(byDisplayName).map((g) => ({ group: g.displayName, apps: [...g.apps].sort() })),
    policies: s.policies,
  });

  // Applies every change or none. Unknown groups, applications and policies are refused.
  function applySettingChanges(s: State, changes: Record<string, unknown>[]) {
    for (const c of changes) {
      if (c.type === "access") {
        const g = s.groups.find((x) => x.displayName === c.group);
        if (!g) throw new HttpError(400, `No group called ${JSON.stringify(c.group)}.`);
        if (typeof c.app !== "string" || !s.apps.some((a) => a.id === c.app)) throw new HttpError(400, `No application called ${JSON.stringify(c.app)}.`);
        if (typeof c.allowed !== "boolean") throw new HttpError(400, "allowed must be true or false.");
        g.apps = c.allowed ? [...new Set([...g.apps, c.app])] : g.apps.filter((a) => a !== c.app);
      } else if (c.type === "policy") {
        const p = s.policies.find((x) => x.id === c.id);
        if (!p) throw new HttpError(400, `No policy called ${JSON.stringify(c.id)}.`);
        if (typeof c.value !== typeof p.value) throw new HttpError(400, `${p.id} takes a ${typeof p.value}.`);
        p.value = c.value as Policy["value"];
      } else {
        throw new HttpError(400, 'Each change has type "access" or "policy".');
      }
    }
  }

  async function settingsChanges(req: IncomingMessage): Promise<Record<string, unknown>[]> {
    const body = await readJson(req, '{"changes":[{"type":"access","group","app","allowed"} or {"type":"policy","id","value"}]}');
    if (!Array.isArray(body.changes) || body.changes.length === 0 || body.changes.some((c) => !c || typeof c !== "object")) {
      throw new HttpError(400, 'The body must be {"changes":[...]}, with at least one change.');
    }
    return body.changes as Record<string, unknown>[];
  }

  // The long page IT clicks through today. No token: it plays a console someone is already signed in to.
  function settingsPage(res: ServerResponse) {
    const s = load();
    const { access, policies } = settingsView(s);
    const apps = s.apps.map((a) => a.id).sort();
    const esc = (t: unknown) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const grid = access
      .map((g) => `<tr><th>${esc(g.group)}</th>${apps.map((a) => `<td><input type="checkbox" data-group="${esc(g.group)}" data-app="${esc(a)}"${g.apps.includes(a) ? " checked" : ""}></td>`).join("")}</tr>`)
      .join("");
    const rows = policies
      .map((p) => `<tr><th>${esc(p.label)}</th><td>${typeof p.value === "boolean" ? `<input type="checkbox" data-policy="${esc(p.id)}"${p.value ? " checked" : ""}>` : `<input data-policy="${esc(p.id)}" data-kind="${typeof p.value}" value="${esc(p.value)}">`}</td></tr>`)
      .join("");
    const html = `<!doctype html><meta charset="utf-8"><title>Identity platform settings</title>
<style>body{font:14px system-ui;margin:24px;color:#222}table{border-collapse:collapse;margin:0 0 32px}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}thead th{writing-mode:vertical-rl}</style>
<h1>Identity platform settings</h1><h2>Which groups reach which applications</h2>
<table><thead><tr><th></th>${apps.map((a) => `<th>${esc(a)}</th>`).join("")}</tr></thead><tbody>${grid}</tbody></table>
<h2>Security policies</h2><table><tbody>${rows}</tbody></table>
<script>
let clicks = 0, pending = 0;
document.addEventListener("change", async (e) => {
  const d = e.target.dataset;
  const value = d.kind === "number" ? Number(e.target.value) : e.target.type === "checkbox" ? e.target.checked : e.target.value;
  const change = d.policy ? { type: "policy", id: d.policy, value } : { type: "access", group: d.group, app: d.app, allowed: value };
  clicks++; pending++;
  await fetch("/admin/settings/click", { method: "POST", body: JSON.stringify({ changes: [change] }) }).finally(() => pending--);
});
// Changes made elsewhere show up by themselves, highlighted for a few seconds.
const key = (i) => JSON.stringify(i.dataset);
setInterval(async () => {
  const seen = clicks;
  if (pending) return;
  const html = await fetch(location.href).then((r) => r.text()).catch(() => null);
  if (!html || pending || seen !== clicks) return;
  const fresh = new Map([...new DOMParser().parseFromString(html, "text/html").querySelectorAll("input")].map((i) => [key(i), i]));
  for (const input of document.querySelectorAll("input")) {
    const next = fresh.get(key(input));
    if (!next || input === document.activeElement || (input.checked === next.checked && input.value === next.value)) continue;
    input.checked = next.checked;
    input.value = next.value;
    const cell = input.closest("td");
    cell.style.background = "#ffe08a";
    setTimeout(() => (cell.style.background = ""), 6000);
  }
}, 1000);
</script>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  }

  type Handler = (req: IncomingMessage, res: ServerResponse, url: URL, params: string[]) => Promise<void> | void;
  const scim = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) =>
    send(res, status, body, headers, SCIM_TYPE);

  const routes: [RegExp, Record<string, Handler>][] = [
    [
      /^\/admin\/v1\/settings$/,
      {
        GET: (_req, res) => send(res, 200, settingsView(load())),
        PATCH: async (req, res) => {
          const changes = await settingsChanges(req);
          const s = load();
          applySettingChanges(s, changes);
          save(s);
          send(res, 200, { applied: changes.length, settings: settingsView(s) });
        },
      },
    ],
    [/^\/admin\/v1\/whoami$/, { GET: (req, res) => send(res, 200, { scope: bearer(req) === token ? "admin" : "read" }) }],
    [/^\/hr\/v1\/employees$/, { GET: (_req, res) => send(res, 200, { items: [...load().hr].sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1)).map(employeeSummary) }) }],
    [
      /^\/hr\/v1\/employees\/([^/]+)$/,
      {
        GET: (_req, res, _url, [id]) => {
          const found = load().hr.find((e) => e.employeeId === id);
          if (!found) throw notFound("employee", id);
          send(res, 200, employeeDetail(found));
        },
      },
    ],
    [
      /^\/scim\/v2\/Users$/,
      {
        GET: (_req, res, url) => {
          const s = load();
          const matches = userFilter(url.searchParams.get("filter"));
          scim(res, 200, listResponse([...s.users].sort(byUserName).filter(matches).map((u) => userView(s, u)), url));
        },
        POST: async (req, res) => {
          const shape = '{"userName","externalId","name":{"givenName","familyName"},"displayName","active"}';
          const body = await readJson(req, shape, "invalidSyntax");
          if (typeof body.userName !== "string" || !USERNAME.test(body.userName)) throw invalidValue(USERNAME_RULE);
          const externalId = body.externalId ?? null;
          if (externalId !== null && (typeof externalId !== "string" || !externalId)) throw invalidValue("externalId must be a string.");
          const name = (body.name ?? {}) as Record<string, unknown>;
          if (typeof name !== "object" || Array.isArray(name)) throw invalidValue('name must be {"givenName": "...", "familyName": "..."}.');
          const givenName = name.givenName ?? "";
          const familyName = name.familyName ?? "";
          if (typeof givenName !== "string" || typeof familyName !== "string") throw invalidValue("name.givenName and name.familyName must be strings.");
          const displayName = body.displayName ?? (`${givenName} ${familyName}`.trim() || body.userName);
          if (typeof displayName !== "string" || !displayName.trim()) throw invalidValue("displayName must be a non-empty string.");
          const active = body.active ?? true;
          if (typeof active !== "boolean") throw invalidValue("active must be true or false.");

          const s = load();
          if (s.users.some((u) => u.userName === body.userName)) {
            throw new HttpError(409, `userName ${JSON.stringify(body.userName)} is already taken.`, "uniqueness");
          }
          if (externalId !== null && s.users.some((u) => u.externalId === externalId)) {
            throw new HttpError(409, `externalId ${JSON.stringify(externalId)} is already taken.`, "uniqueness");
          }
          const created: User = { id: randomUUID(), userName: body.userName, externalId, givenName, familyName, displayName, active };
          s.users.push(created);
          save(s);
          scim(res, 201, userView(s, created), { Location: `/scim/v2/Users/${created.id}` });
        },
      },
    ],
    [
      /^\/scim\/v2\/Users\/([^/]+)$/,
      {
        GET: (_req, res, _url, [id]) => {
          const s = load();
          scim(res, 200, userView(s, user(s, id)));
        },
        PATCH: async (req, res, _url, [id]) => {
          const ops = operations(await readJson(req, USER_PATCH_EXAMPLE, "invalidSyntax"), USER_PATCH_EXAMPLE);
          const s = load();
          const target = user(s, id);
          const changed = { ...target };
          for (const op of ops) {
            if (typeof op.op !== "string" || op.op.toLowerCase() !== "replace") {
              throw invalidValue(`Users take op "replace" only, with path ${USER_PATCH_PATHS}.`);
            }
            const apply = typeof op.path === "string" ? userPatches[op.path.toLowerCase()] : undefined;
            if (!apply) throw new HttpError(400, `path must be one of ${USER_PATCH_PATHS}.`, "invalidPath");
            apply(changed, op.value);
          }
          Object.assign(target, changed);
          save(s);
          scim(res, 200, userView(s, target));
        },
        DELETE: (_req, res, _url, [id]) => {
          const s = load();
          user(s, id);
          s.users = s.users.filter((u) => u.id !== id);
          for (const g of s.groups) g.members = g.members.filter((m) => m !== id);
          save(s);
          scim(res, 204);
        },
      },
    ],
    [
      /^\/scim\/v2\/Groups$/,
      {
        GET: (_req, res, url) => {
          if (url.searchParams.get("filter") !== null) throw new HttpError(400, "Groups cannot be filtered.", "invalidFilter");
          const s = load();
          scim(res, 200, listResponse([...s.groups].sort(byDisplayName).map((g) => groupView(s, g)), url));
        },
      },
    ],
    [
      /^\/scim\/v2\/Groups\/([^/]+)$/,
      {
        GET: (_req, res, _url, [id]) => {
          const s = load();
          scim(res, 200, groupView(s, group(s, id)));
        },
        PATCH: async (req, res, _url, [id]) => {
          const ops = operations(await readJson(req, GROUP_PATCH_EXAMPLE, "invalidSyntax"), GROUP_PATCH_EXAMPLE);
          const s = load();
          const target = group(s, id);
          const members = [...target.members];
          for (const op of ops) {
            const kind = typeof op.op === "string" ? op.op.toLowerCase() : "";
            const path = typeof op.path === "string" ? op.path : "";
            if (kind === "add" && path.toLowerCase() === "members") {
              const values = op.value;
              if (!Array.isArray(values) || values.some((v) => !v || typeof v.value !== "string")) {
                throw invalidValue('value must be a list of members: [{"value": "<userId>"}].');
              }
              for (const { value } of values as { value: string }[]) {
                if (!s.users.some((u) => u.id === value)) throw invalidValue(`No user with id ${JSON.stringify(value)}.`);
                if (!members.includes(value)) members.push(value);
              }
            } else if (kind === "remove") {
              const m = path.match(/^\s*members\s*\[\s*value\s+eq\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/i);
              if (!m) throw new HttpError(400, `To remove a member, use path members[value eq "<userId>"].`, "invalidPath");
              const userId = m[1].replace(/\\(.)/g, "$1");
              const at = members.indexOf(userId);
              if (at >= 0) members.splice(at, 1);
            } else {
              throw new HttpError(400, `Groups take ${GROUP_PATCH_EXAMPLE}.`, kind === "add" ? "invalidPath" : "invalidValue");
            }
          }
          target.members = members;
          save(s);
          scim(res, 200, groupView(s, target));
        },
      },
    ],
  ];

  async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    const path = url.pathname.replace(/\/+$/, "");
    const readonlyOk = path.startsWith("/admin/v1/") && authorized(req, readonlyToken);
    if (!authorized(req, token) && !readonlyOk) {
      throw new HttpError(401, "Missing or invalid token. Send Authorization: Bearer <token>.", undefined, {
        "WWW-Authenticate": 'Bearer realm="routa"',
      });
    }
    for (const [pattern, methods] of routes) {
      const match = path.match(pattern);
      if (!match) continue;
      const method = req.method === "HEAD" ? "GET" : req.method || "GET";
      const handler = methods[method];
      if (!handler) {
        const allow = Object.keys(methods).join(", ");
        throw new HttpError(405, `Use ${allow} here.`, undefined, { Allow: allow });
      }
      let params: string[];
      try {
        params = match.slice(1).map((p) => decodeURIComponent(p));
      } catch {
        throw new HttpError(404, `No such endpoint: ${path}`);
      }
      return await handler(req, res, url, params);
    }
    throw new HttpError(404, `No such endpoint: ${path}`);
  }

  return createServer(async (req, res) => {
    const started = Date.now();
    res.on("finish", () => {
      opts.log(`${new Date().toISOString()} ${req.method} ${redact(req.url || "")} ${res.statusCode} ${Date.now() - started}ms`);
    });
    let path = "";
    try {
      const url = new URL(req.url || "/", "http://localhost");
      path = url.pathname.replace(/\/+$/, "");
      if (path === "/collect" || path.startsWith("/collect/")) return await collect(req, res);
      if (path === "/auth/check") return await authCheck(req, res);
      if (path === "/api/v1" || path.startsWith("/api/v1/")) {
        throw new HttpError(410, "Version 1 is gone. Use version 2: /scim/v2/Users.", undefined, {
          Deprecation: "true",
          Link: '</scim/v2/Users>; rel="successor-version"',
        });
      }
      if (path === "/admin/settings" && (req.method === "GET" || req.method === "HEAD")) return settingsPage(res);
      if (path === "/admin/settings/click" && req.method === "POST") {
        const changes = await settingsChanges(req);
        const s = load();
        applySettingChanges(s, changes);
        save(s);
        return send(res, 200, { applied: changes.length });
      }
      if (path.startsWith("/hr/") || path.startsWith("/scim/") || path.startsWith("/admin/v1/")) return await api(req, res, url);
      throw new HttpError(404, `No such endpoint: ${path || "/"}`);
    } catch (err) {
      const type = path.startsWith("/scim/") ? SCIM_TYPE : JSON_TYPE;
      if (err instanceof HttpError) {
        req.resume();
        const body = { status: String(err.status), ...(err.scimType ? { scimType: err.scimType } : {}), detail: err.message };
        if (!res.headersSent) send(res, err.status, body, err.headers, type);
        return;
      }
      opts.log(`error: ${redact(String(err))}`);
      if (!res.headersSent) send(res, 500, { status: "500", detail: "Something went wrong in the test environment." }, {}, type);
    }
  });
}
