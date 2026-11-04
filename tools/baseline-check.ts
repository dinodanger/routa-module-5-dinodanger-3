// Compares the platform's settings with Routa's security baseline, in client/security-baseline.json. Changes nothing.
// npm run baseline:check, with ROUTA_TOKEN set. ROUTA_URL points it at a copy on another port.
import { readFileSync } from "node:fs";

const url = process.env.ROUTA_URL || "http://localhost:4686";
const token = process.env.ROUTA_TOKEN;
if (!token) {
  console.error("Set ROUTA_TOKEN first.");
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(new URL("../client/security-baseline.json", import.meta.url), "utf8"));
const res = await fetch(`${url}/admin/v1/settings`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`The settings API answered ${res.status}. Is the test environment running at ${url}?`);
  process.exit(2);
}
const settings = (await res.json()) as { access: { group: string; apps: string[] }[]; policies: { id: string; value: unknown }[] };

const wrong: string[] = [];
for (const { group, apps } of settings.access) {
  const allowed: string[] = baseline.access[group] ?? [];
  for (const app of apps) if (!allowed.includes(app)) wrong.push(`${group} reaches ${app}: the baseline says it must not`);
  for (const app of allowed) if (!apps.includes(app)) wrong.push(`${group} doesn't reach ${app}: the baseline says it should`);
}
for (const { id, value } of settings.policies) {
  if (baseline.policies[id] !== value) wrong.push(`${id} is ${JSON.stringify(value)}: the baseline says ${JSON.stringify(baseline.policies[id])}`);
}

if (wrong.length === 0) {
  console.log("Every setting matches the baseline.");
} else {
  console.log(`${wrong.length} settings don't match the baseline:`);
  for (const line of wrong) console.log(`- ${line}`);
  process.exitCode = 1;
}
