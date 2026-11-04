// PreToolUse hook: refuses any change to mcp/src/token-check.ts.
// Covers file-edit tools and shell commands that write to the file.
// A command that only mentions the file (git add, cat, grep) is allowed.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const PROTECTED = "mcp/src/token-check.ts";
const NAME = /(^|\/)token-check\.ts$/;

type Input = {
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; command?: string };
};

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

export function isProtectedPath(path: string, cwd: string, root: string): boolean {
  return real(resolve(cwd, path)) === real(resolve(root, PROTECTED));
}

// Split a command into segments of tokens (quotes removed).
// Separators: ; & && | || newline. Redirections stay as tokens.
export function parse(command: string): string[][] {
  const segments: string[][] = [];
  let tokens: string[] = [];
  let word = "";
  let inWord = false;
  let quote = "";
  const endWord = () => {
    if (inWord) tokens.push(word);
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      inWord = true;
    } else if (c === " " || c === "\t") {
      endWord();
    } else if (c === "\n" || c === ";" || c === "|") {
      endSegment();
    } else if (c === "&") {
      const prev = command[i - 1];
      const next = command[i + 1];
      if (next === ">" || prev === ">" || prev === "<") {
        word += c; // 2>&1, &>file, <&3
        inWord = true;
      } else {
        endSegment();
      }
    } else {
      word += c;
      inWord = true;
    }
  }
  endSegment();
  return segments;
}

const matches = (t: string) => NAME.test(t.replace(/^[^=/]*=(?=.*token-check)/, ""));
const WRAPPERS = new Set(["sudo", "command", "env", "nohup", "time", "exec", "builtin"]);
const INTERPRETERS = /^(node|python3?|ruby|perl|bash|sh|zsh|deno|bun)$/;
const WRITES_FILE = /write|append|\bopen\(|unlink|rename|rmSync|truncate|copyFile|\b(cp|mv|tee|rm)\b|>|sed -i/;

export function segmentWrites(tokens: string[]): boolean {
  // redirections: >file  >>file  1>file  &>file  >|file, or ">" then file
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^(?:\d*|&)>[>|]?(.*)$/);
    if (!m) continue;
    const target = m[1] || tokens[i + 1] || "";
    if (matches(target)) return true;
  }
  const words = tokens.filter((t) => !/^(?:\d*|&)>/.test(t));
  let k = 0;
  while (k < words.length && (/^\w+=/.test(words[k]) || WRAPPERS.has(words[k]))) k++;
  const cmd = (words[k] ?? "").replace(/^.*\//, "");
  const args = words.slice(k + 1);
  if (INTERPRETERS.test(cmd) && args.some((a) => a.includes("token-check") && WRITES_FILE.test(a))) return true;
  if (!args.some(matches)) return false;
  const last = args[args.length - 1];
  switch (cmd) {
    case "tee":
    case "mv":
    case "rm":
    case "unlink":
    case "truncate":
    case "shred":
      return true;
    case "cp":
    case "install":
    case "ln":
    case "rsync":
      return matches(last) || args.some((a) => /^(-t|--target-directory)/.test(a) && matches(a));
    case "dd":
      return args.some((a) => a.startsWith("of=") && matches(a.slice(3)));
    case "sed":
    case "perl":
    case "ruby":
      return args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === "--in-place" || a.startsWith("--in-place="));
    case "git": {
      const sub = args.find((a) => !a.startsWith("-"));
      return ["checkout", "restore", "rm", "mv", "apply"].includes(sub ?? "");
    }
    default:
      return false;
  }
}

export function commandWritesProtected(command: string): boolean {
  return parse(command).some(segmentWrites);
}

export function decide(input: Input, root: string): string | null {
  const cwd = input.cwd ?? root;
  const ti = input.tool_input ?? {};
  const path = ti.file_path ?? ti.notebook_path;
  if (path && isProtectedPath(path, cwd, root)) return `${PROTECTED} must not be edited.`;
  if (input.tool_name === "Bash" && ti.command && commandWritesProtected(ti.command)) {
    return `This command writes to ${PROTECTED}, which must not be changed.`;
  }
  return null;
}

if (import.meta.main) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input: Input = raw.trim() ? JSON.parse(raw) : {};
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const reason = decide(input, root);
  if (reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      }),
    );
  }
}
