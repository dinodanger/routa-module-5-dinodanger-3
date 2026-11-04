import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandWritesProtected, decide } from "../../.claude/hooks/protect-token-check.ts";
import { lintTools } from "../../tools/lint.ts";

const ROOT = "/repo";
const F = "mcp/src/token-check.ts";

test("hook refuses file edits to token-check.ts", () => {
  for (const tool_name of ["Edit", "Write", "MultiEdit"]) {
    assert.ok(decide({ tool_name, tool_input: { file_path: `${ROOT}/${F}` } }, ROOT), tool_name);
  }
  assert.ok(decide({ tool_name: "Edit", cwd: `${ROOT}/mcp`, tool_input: { file_path: "src/../src/token-check.ts" } }, ROOT));
  assert.equal(decide({ tool_name: "Edit", tool_input: { file_path: `${ROOT}/mcp/src/server.ts` } }, ROOT), null);
});

test("hook refuses shell commands that write to token-check.ts", () => {
  for (const c of [
    `echo x > ${F}`,
    `echo x >> ${F}`,
    `echo x 2>/dev/null >${F}`,
    `cat a | tee ${F}`,
    `sed -i 's/a/b/' ${F}`,
    `perl -pi -e 's/a/b/' ${F}`,
    `cd mcp/src && echo x > token-check.ts`,
    `mv other.ts ${F}`,
    `cp other.ts ${F}`,
    `rm ${F}`,
    `git checkout -- ${F}`,
    `git restore ${F}`,
    `dd if=/dev/zero of=${F}`,
    `node -e "require('fs').writeFileSync('${F}','')"`,
    `python3 -c "open('${F}','w').write('')"`,
    `ls && printf x > "${F}"`,
  ]) assert.ok(commandWritesProtected(c), c);
});

test("hook allows commands that only mention token-check.ts", () => {
  for (const c of [
    `git add ${F}`,
    `git add -A && git commit -m "touch ${F}"`,
    `git diff ${F}`,
    `git status ${F}`,
    `cat ${F}`,
    `grep -n token ${F}`,
    `cp ${F} /tmp/backup.ts`,
    `echo "do not edit ${F}"`,
    `echo x > notes.txt # ${F}`,
    `sed -n 1,5p ${F}`,
    `wc -l ${F} 2>&1`,
    `node -e "console.log(require('fs').readFileSync('${F}','utf8'))"`,
  ]) assert.equal(commandWritesProtected(c), false, c);
});

test("hook, run as a process, denies and allows", () => {
  const run = (input: object) =>
    spawnSync("node", [".claude/hooks/protect-token-check.ts"], {
      input: JSON.stringify(input),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
    });
  const denied = run({ tool_name: "Bash", tool_input: { command: `echo x > ${F}` } });
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run({ tool_name: "Bash", tool_input: { command: `git add ${F}` } }).stdout, "");
});

function toolsDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "lint-"));
  mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(files)) writeFileSync(join(dir, name), src);
  return dir;
}

test("lint fails a tool that calls patchSettings without showChange", () => {
  const dir = toolsDir({ "bad.ts": `import { patchSettings } from "../platform.ts";\nawait patchSettings([]);` });
  assert.equal(lintTools(dir).length, 1);
});

test("lint passes tools that show the change, apply-change.ts, and commented mentions", () => {
  const dir = toolsDir({
    "good.ts": `await patchSettings(c);\nshowChange(c, s);`,
    "apply-change.ts": `await patchSettings(c);`,
    "read-only.ts": `// patchSettings( is not called here\nreturn 1;`,
  });
  assert.deepEqual(lintTools(dir), []);
});
