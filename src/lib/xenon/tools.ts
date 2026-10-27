// Xenon 1 AI — Agent Tool Registry (server-only)
// ابزارهای واقعی عامل: وب، مرورگر ابری، گیت‌هاب، فایل‌های سندباکس، ترمینال، حافظه
//
// Engineering note: these are pure execution infrastructure. Intelligence comes
// ONLY from the Z.ai GLM gateway (function calling) — no other LLM provider is
// involved anywhere in this file.
//
// Sandbox model:
//  - write_file / list_files / run_command are confined to AGENT_WORKSPACE
//  - read_file can read project files (for repo Q&A) but denies secrets
//  - run_command has a blocklist + timeout + output cap
//  - all tool outputs are string-typed and capped before entering model context

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { exec } from "child_process";
import path from "path";
import { db } from "@/lib/db";
import { pageReader, webSearch } from "./llm";
import { parseGithubUrl, githubRead, githubPutFile, ghConfigured } from "./github";
import type { ResearchSource } from "./types";

export const PROJECT_ROOT = process.cwd();
export const AGENT_WORKSPACE = path.join(PROJECT_ROOT, "agent-workspace");

const READ_CHAR_CAP = 12_000;
const TOOL_OUTPUT_CAP = 8_000;
const CMD_TIMEOUT_MS = 25_000;
const CMD_OUTPUT_CAP = 8_000;
const LIST_ENTRY_CAP = 200;
const PAGE_FETCH_CHARS = 6_000;
const MEMORY_RESULT_CAP = 8;

// --- Tool specs (OpenAI function-calling JSON Schema) ---

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const AGENT_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live web. Returns ranked results with title, snippet and URL. Use for current events, documentation lookups, facts you are unsure about, or anything after your knowledge cutoff.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords (not full sentences). English usually works best." },
          num: { type: "integer", description: "Number of results, 1-10. Default 6." },
          recency_days: { type: "integer", description: "Restrict to results from the last N days (optional)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Open a URL with the cloud browser and extract its readable text (about 6000 chars). Use after web_search to read a promising result, or directly on URLs the user provided.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL to read." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_read",
      description:
        "Read a public GitHub repository (README + file tree) or a specific file/branch from the cloud. Accepts a github.com URL or an 'owner/repo' shorthand.",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "A github.com URL (repo, tree or blob link) or 'owner/repo'." },
        },
        required: ["repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_write",
      description:
        "Commit a text file to the configured GitHub repository (cloud persistence). Only available when GitHub is configured on the server.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo-relative file path, e.g. notes/idea.md. Never absolute, never '..'." },
          content: { type: "string", description: "Full UTF-8 text content of the file." },
          message: { type: "string", description: "Short imperative commit message." },
        },
        required: ["path", "content", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file. Looks first in the project repository (read-only; secrets like .env denied), then falls back to the agent workspace where your written files live. Use to inspect code/configs and to re-check files you created.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Project-relative path, e.g. src/app/page.tsx or package.json." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a text file inside the agent workspace (agent-workspace/). Use for code artifacts, scripts, generated documents. Parent directories are created automatically.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workspace-relative path, e.g. hello.js or src/util.ts." },
          content: { type: "string", description: "Full UTF-8 text content to write." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files and directories inside the agent workspace (default) or a project-relative directory. Shows names, sizes and types.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional directory path. Defaults to the agent workspace root." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command in the agent workspace sandbox (25s timeout, output capped). Use to execute node/python scripts you wrote, run tests, compile snippets, inspect outputs. Package installs may time out; keep commands short.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute, e.g. 'node hello.js'." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_search",
      description:
        "Search the user's persistent long-term memory (saved preferences, facts, project context). Use when prior context about the user could change your answer.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords to look for in memory." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_save",
      description:
        "Save a durable fact about the user or project to long-term memory (their stack, preferences, goals, decisions). Do NOT save secrets or transient chat details.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "One concise self-contained memory sentence." },
          category: { type: "string", description: "One of: preference | fact | project | general." },
        },
        required: ["content"],
      },
    },
  },
];

// --- Execution context & results ---

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface ToolRunContext {
  /** Shared source list for citation numbering [n] — deduped, rank-aligned. */
  sources: ResearchSource[];
  /** Called by web tools so the UI can show sources live. */
  onSourcesChanged?: (sources: ResearchSource[]) => void;
}

function cap(text: string, max = TOOL_OUTPUT_CAP): string {
  const t = text ?? "";
  return t.length > max ? `${t.slice(0, max)}\n…(truncated, ${t.length} chars total)` : t;
}

// --- Sandbox path guards ---

const DENY_DIR_PARTS = new Set(["node_modules", ".git", ".next", "dist", ".turbo"]);
const SENSITIVE_BASE_RE = /^\.env|^\.pypirc|credentials|\.pem$|\.key$|\.p12$|\.pfx$/i;

function isSensitive(relParts: string[], base: string): boolean {
  if (relParts.some((p) => DENY_DIR_PARTS.has(p))) return true;
  if (SENSITIVE_BASE_RE.test(base)) return true;
  if (relParts[0] === "db" && /\.db$|\.sqlite/i.test(base)) return true;
  if (relParts[0] === ".env.local") return true;
  return false;
}

/** Resolve a user path under base, rejecting escapes and sensitive targets. */
function resolveGuarded(base: string, userPath: string): { abs: string } | { error: string } {
  const cleaned = String(userPath ?? "").trim();
  if (!cleaned) return { error: "Empty path." };
  if (cleaned.includes("\0")) return { error: "Invalid path." };
  const abs = path.resolve(base, cleaned);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { error: `Path escapes the sandbox: ${cleaned}` };
  }
  const parts = rel.split(path.sep).filter(Boolean);
  if (base === PROJECT_ROOT && isSensitive(parts, path.basename(abs))) {
    return { error: `Access to this path is denied by the sandbox policy: ${cleaned}` };
  }
  return { abs };
}

function looksBinary(buf: Buffer): boolean {
  const probe = buf.subarray(0, Math.min(buf.length, 1024));
  return probe.includes(0);
}

// --- Executors ---

async function execWebSearch(args: { query?: string; num?: number; recency_days?: number }, ctx: ToolRunContext): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, output: "Missing required argument: query." };
  const num = Math.min(Math.max(Number(args.num) || 6, 1), 10);
  const recency = Number(args.recency_days) || undefined;
  const results = await webSearch(query, num, recency);
  if (results.length === 0) return { ok: false, output: `No web results for "${query}".` };

  // Merge into shared sources with citation numbering so the model can cite [n]
  const seen = new Set(ctx.sources.map((s) => s.url));
  const lines: string[] = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url) || ctx.sources.length >= 12) continue;
    seen.add(r.url);
    ctx.sources.push({ ...r, rank: 0 });
    const n = ctx.sources.length;
    lines.push(`[${n}] ${r.name} — ${r.host_name}${r.date ? ` (${r.date})` : ""}\n    snippet: ${r.snippet}\n    url: ${r.url}`);
  }
  ctx.sources.forEach((s, i) => {
    s.rank = i + 1;
  });
  ctx.onSourcesChanged?.([...ctx.sources]);
  if (lines.length === 0) {
    return { ok: true, output: `Results for "${query}" were duplicates of already-collected sources. Current sources:\n${ctx.sources.map((s, i) => `[${i + 1}] ${s.url}`).join("\n")}` };
  }
  return {
    ok: true,
    output: `Web results for "${query}" (cite them as [n]):\n${lines.join("\n")}`,
  };
}

async function execWebFetch(args: { url?: string }, ctx: ToolRunContext): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, output: "Invalid or missing URL (must start with http/https)." };
  const page = await pageReader(url, 25_000, PAGE_FETCH_CHARS);
  if (!page || !page.text) return { ok: false, output: `Could not read ${url} (blocked, JS-only page, or unreachable).` };
  const host = (() => {
    try { return new URL(url).host; } catch { return url; }
  })();
  if (!ctx.sources.some((s) => s.url === url)) {
    ctx.sources.push({
      url,
      name: page.title || host,
      snippet: page.text.slice(0, 200),
      host_name: host,
      rank: 0,
    });
    ctx.sources.forEach((s, i) => {
      s.rank = i + 1;
    });
    ctx.onSourcesChanged?.([...ctx.sources]);
  }
  const n = ctx.sources.findIndex((s) => s.url === url) + 1;
  return {
    ok: true,
    output: `Content of ${url} (cite as [${n}] if used):\n\n${page.text}`,
  };
}

async function execGithubRead(args: { repo?: string }): Promise<ToolResult> {
  const raw = String(args.repo ?? "").trim();
  if (!raw) return { ok: false, output: "Missing required argument: repo." };
  let ref = parseGithubUrl(raw);
  if (!ref) {
    const shorthand = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (shorthand) ref = { owner: shorthand[1], repo: shorthand[2] };
  }
  if (!ref) return { ok: false, output: `"${raw}" is not a recognizable GitHub reference (use a github.com URL or owner/repo).` };
  const result = await githubRead(ref);
  if (!result.ok) return { ok: false, output: `GitHub read failed for ${result.label}: ${result.error ?? "unknown error"}` };
  return { ok: true, output: cap(result.context) };
}

async function execGithubWrite(args: { path?: string; content?: string; message?: string }): Promise<ToolResult> {
  if (!ghConfigured()) {
    return { ok: false, output: "GitHub write is not configured on this server (missing GITHUB_TOKEN / GITHUB_REPO)." };
  }
  const p = String(args.path ?? "").trim();
  const content = String(args.content ?? "");
  const message = String(args.message ?? "").trim() || "Xenon agent update";
  if (!p || p.startsWith("/") || p.includes("..")) {
    return { ok: false, output: "Invalid path: use a safe repo-relative path like notes/file.md." };
  }
  if (!content.trim()) return { ok: false, output: "Refusing to commit empty content." };
  const result = await githubPutFile(p, message, content);
  if (!result.ok) return { ok: false, output: `GitHub commit failed: ${result.error ?? "unknown error"}` };
  return {
    ok: true,
    output: `Committed ${result.path}${result.sha ? ` (commit ${result.sha.slice(0, 7)})` : ""}${result.htmlUrl ? `\n${result.htmlUrl}` : ""}`,
  };
}

async function execReadFile(args: { path?: string }): Promise<ToolResult> {
  const requested = String(args.path ?? "");
  // محل اول: ریشهٔ پروژه؛ اگر نبود، سندباکس فضای کاری عامل (سازگاری با list_files)
  let root = PROJECT_ROOT;
  const first = resolveGuarded(PROJECT_ROOT, requested);
  if ("error" in first) {
    // مسیر در ریشهٔ پروژه ممنوع/خارج از سندباکس است — تلاش در فضای کاری
    root = AGENT_WORKSPACE;
  } else if (!existsSync(first.abs)) {
    root = AGENT_WORKSPACE;
  }

  const guarded = resolveGuarded(root, requested);
  if ("error" in guarded) return { ok: false, output: guarded.error };
  const abs = guarded.abs;
  if (!existsSync(abs)) {
    return {
      ok: false,
      output: `File not found in project root or agent workspace: ${requested}. Tip: run list_files (defaults to agent-workspace) to see exact names.`,
    };
  }
  const st = statSync(abs);
  if (st.isDirectory()) return { ok: false, output: `${requested} is a directory — use list_files instead.` };
  if (st.size > 512_000) return { ok: false, output: `File too large to read (${Math.round(st.size / 1024)} KB).` };
  const buf = readFileSync(abs);
  if (looksBinary(buf)) return { ok: false, output: `${requested} appears to be binary; only text files are readable.` };
  const text = buf.toString("utf-8");
  const scope = root === AGENT_WORKSPACE ? "agent-workspace" : "project";
  return {
    ok: true,
    output: `File ${requested} from ${scope} (${text.length} chars):\n\n${cap(text, READ_CHAR_CAP)}`,
  };
}

function ensureWorkspace(): void {
  if (!existsSync(AGENT_WORKSPACE)) mkdirSync(AGENT_WORKSPACE, { recursive: true });
}

async function execWriteFile(args: { path?: string; content?: string }): Promise<ToolResult> {
  ensureWorkspace();
  const guarded = resolveGuarded(AGENT_WORKSPACE, String(args.path ?? ""));
  if ("error" in guarded) return { ok: false, output: guarded.error };
  const content = String(args.content ?? "");
  if (!content) return { ok: false, output: "Refusing to write empty content (use a placeholder if intentional)." };
  mkdirSync(path.dirname(guarded.abs), { recursive: true });
  writeFileSync(guarded.abs, content, "utf-8");
  return { ok: true, output: `Wrote ${content.length} chars to agent-workspace/${String(args.path).replace(/^\//, "")}` };
}

async function execListFiles(args: { path?: string }): Promise<ToolResult> {
  const base = String(args.path ?? "").trim() ? PROJECT_ROOT : AGENT_WORKSPACE;
  const guarded = resolveGuarded(base, String(args.path ?? "."));
  if ("error" in guarded) return { ok: false, output: guarded.error };
  const abs = guarded.abs;
  if (!existsSync(abs)) return { ok: false, output: `Directory not found: ${String(args.path)}` };
  const st = statSync(abs);
  if (!st.isDirectory()) return { ok: false, output: `${String(args.path)} is a file, not a directory.` };

  const rel = path.relative(PROJECT_ROOT, abs);
  const entries = readdirSync(abs)
    .filter((name) => {
      const parts = [...rel.split(path.sep).filter(Boolean), name];
      return !isSensitive(parts, name);
    })
    .slice(0, LIST_ENTRY_CAP)
    .map((name) => {
      const full = path.join(abs, name);
      try {
        const s = statSync(full);
        return s.isDirectory()
          ? `${name}/`
          : `${name} (${Math.max(1, Math.round(s.size / 1024))} KB)`;
      } catch {
        return name;
      }
    });
  const scope = String(args.path ?? "").trim() ? String(args.path) : "agent-workspace";
  return {
    ok: true,
    output: entries.length
      ? `Entries in ${scope}:\n${entries.join("\n")}`
      : `${scope} is empty.`,
  };
}

/** Destructive / out-of-scope command patterns. */
const CMD_BLOCKLIST: RegExp[] = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i,
  /\b(sudo|su\s|shutdown|reboot|halt|poweroff)\b/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /\(\)\s*\{[^}]*\}\s*;\s*:/, // fork bomb shape
  /\b(curl|wget)\b[^|;&]*\|\s*(ba)?sh\b/i,
  /\bchmod\s+-?R?\s*777?\s+\//i,
  /\b>\s*\/dev\/(sd|nvme)/i,
  /\bkill(all)?\b/i,
  /\b(apt|apt-get|yum|dnf)\s+(install|remove|purge|upgrade)\b/i,
  /\bgit\s+push\b/i,
  /\/etc\/(passwd|shadow|sudoers)/,
];

function runShell(command: string, cwd: string, timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: cwd, LANG: "C.UTF-8" },
      },
      (error, stdout, stderr) => {
        const timedOut = error && (error as NodeJS.ErrnoException).killed;
        const out = [stdout?.toString() ?? "", stderr?.toString() ?? ""].filter(Boolean).join("\n--- stderr ---\n");
        const code = error && !timedOut ? (typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1) : 0;
        const tail = `\n[exit ${code}${timedOut ? ", killed after timeout" : ""}]`;
        resolve({
          ok: !error,
          output: cap(out.trim() || "(no output)", CMD_OUTPUT_CAP) + tail,
        });
      }
    );
  });
}

async function execRunCommand(args: { command?: string }): Promise<ToolResult> {
  const command = String(args.command ?? "").trim();
  if (!command) return { ok: false, output: "Missing required argument: command." };
  if (command.length > 500) return { ok: false, output: "Command too long (max 500 chars)." };
  for (const re of CMD_BLOCKLIST) {
    if (re.test(command)) {
      return { ok: false, output: `Blocked by sandbox policy (destructive or out-of-scope command): ${command.slice(0, 120)}` };
    }
  }
  ensureWorkspace();
  const res = await runShell(command, AGENT_WORKSPACE, CMD_TIMEOUT_MS);
  return { ok: res.ok, output: `$ ${command}\n${res.output}` };
}

async function execMemorySearch(args: { query?: string }): Promise<ToolResult> {
  const query = String(args.query ?? "").trim().toLowerCase();
  if (!query) return { ok: false, output: "Missing required argument: query." };
  const rows = await db.memory.findMany({ orderBy: { updatedAt: "desc" }, take: 200 });
  const words = query.split(/\s+/).filter((w) => w.length > 2);
  const scored = rows
    .map((m) => {
      const hay = m.content.toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += 1;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MEMORY_RESULT_CAP);
  if (scored.length === 0) return { ok: true, output: `No memories match "${query}".` };
  return {
    ok: true,
    output: `Memories matching "${query}":\n${scored.map((x, i) => `${i + 1}. [${x.m.category}] ${x.m.content.slice(0, 200)}`).join("\n")}`,
  };
}

async function execMemorySave(args: { content?: string; category?: string }): Promise<ToolResult> {
  const content = String(args.content ?? "").trim();
  if (!content) return { ok: false, output: "Missing required argument: content." };
  const category = ["preference", "fact", "project", "general"].includes(String(args.category))
    ? String(args.category)
    : "general";
  const mem = await db.memory.create({ data: { content: content.slice(0, 500), category } });
  return { ok: true, output: `Saved to long-term memory [${mem.category}]: ${mem.content.slice(0, 120)}` };
}

// --- Dispatcher ---

type ToolArgs = Record<string, unknown>;
type ToolExecutor = (args: ToolArgs, ctx: ToolRunContext) => Promise<ToolResult>;

const EXECUTORS: Record<string, ToolExecutor> = {
  web_search: (a, c) => execWebSearch(a as never, c),
  web_fetch: (a, c) => execWebFetch(a as never, c),
  github_read: (a) => execGithubRead(a as never),
  github_write: (a) => execGithubWrite(a as never),
  read_file: (a) => execReadFile(a as never),
  write_file: (a) => execWriteFile(a as never),
  list_files: (a) => execListFiles(a as never),
  run_command: (a) => execRunCommand(a as never),
  memory_search: (a) => execMemorySearch(a as never),
  memory_save: (a) => execMemorySave(a as never),
};

export function toolNames(): string[] {
  return Object.keys(EXECUTORS);
}

export async function runTool(name: string, rawArguments: string, ctx: ToolRunContext): Promise<ToolResult> {
  const executor = EXECUTORS[name];
  if (!executor) {
    return { ok: false, output: `Unknown tool "${name}". Available: ${toolNames().join(", ")}` };
  }
  let args: ToolArgs = {};
  const raw = (rawArguments ?? "").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as ToolArgs;
    } catch {
      return { ok: false, output: `Tool arguments were not valid JSON: ${raw.slice(0, 200)}` };
    }
  }
  try {
    return await executor(args, ctx);
  } catch (err) {
    return { ok: false, output: `Tool "${name}" crashed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}
