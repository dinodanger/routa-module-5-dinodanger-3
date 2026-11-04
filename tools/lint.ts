// Every change is shown before it is applied: a tool that calls patchSettings
// must also call showChange. apply-change.ts is exempt; it applies a change
// that preview-change.ts already showed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXEMPT = new Set(["apply-change.ts", "index.ts"]);

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const calls = (src: string, name: string) => new RegExp(`\\b${name}\\s*\\(`).test(src);

export function lintTools(dir: string): string[] {
  const problems: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !EXEMPT.has(f)).sort()) {
    const src = stripComments(readFileSync(join(dir, file), "utf8"));
    if (calls(src, "patchSettings") && !calls(src, "showChange")) {
      problems.push(`${join(dir, file)}: calls patchSettings without calling showChange`);
    }
  }
  return problems;
}

if (import.meta.main) {
  const problems = lintTools("mcp/src/tools");
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("lint: ok");
}
