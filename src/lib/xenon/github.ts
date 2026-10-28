// Xenon 1 AI — GitHub Cloud Access (server-only)
// ابزار دسترسی ابری عامل به گیت‌هاب: خواندن مخزن/فایل و ذخیره‌سازی فایل
// توکن فقط سمت سرور خوانده می‌شود (process.env) و هرگز به کلاینت نمی‌رود.

const GH_API = "https://api.github.com";
const MAX_READ_CHARS = 6_000;
const MAX_SAVE_CHARS = 200_000;

export interface GhConfig {
  token: string | null;
  /** default repo in "owner/name" form */
  defaultRepo: string | null;
}

export function ghConfig(): GhConfig {
  const token = process.env.GITHUB_TOKEN?.trim() || null;
  const repo = process.env.GITHUB_REPO?.trim() || null;
  return { token, defaultRepo: repo };
}

export function ghConfigured(): boolean {
  const cfg = ghConfig();
  return Boolean(cfg.token && cfg.defaultRepo);
}

function ghHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Xenon1-Agent",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** GitHub URL → { owner, repo, branch?, path? } یا null */
export function parseGithubUrl(raw: string): {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
} | null {
  const m = raw.match(
    /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/([^\s?#]+))?)?/
  );
  if (!m) return null;
  const [, owner, repo, branch, path] = m;
  return {
    owner,
    repo,
    branch: branch || undefined,
    path: path ? decodeURIComponent(path) : undefined,
  };
}

export interface GhReadResult {
  ok: boolean;
  label: string;
  context: string;
  source?: { url: string; name: string; snippet: string; host_name?: string };
  error?: string;
}

/** خواندن یک مخزن/مسیر گیت‌هاب و ساخت بلوک زمینه برای عامل */
export async function githubRead(ref: {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}): Promise<GhReadResult> {
  const { token } = ghConfig();
  const base = `${GH_API}/repos/${ref.owner}/${ref.repo}`;
  const label = `${ref.owner}/${ref.repo}${ref.path ? `/${ref.path}` : ""}`;
  try {
    const parts: string[] = [];
    let htmlUrl = `https://github.com/${label}`;
    let snippet = "";

    // metadata
    const repoRes = await fetch(base, { headers: ghHeaders(token), cache: "no-store" });
    if (repoRes.ok) {
      const meta = (await repoRes.json()) as {
        description?: string;
        default_branch?: string;
        stargazers_count?: number;
        language?: string;
        html_url?: string;
      };
      htmlUrl = meta.html_url ?? htmlUrl;
      parts.push(
        `repo: ${label} — ${meta.description || "(no description)"} | default branch: ${meta.default_branch ?? "?"} | language: ${meta.language ?? "?"} | stars: ${meta.stargazers_count ?? 0}`
      );
    }
    const defaultBranch = ref.branch || "main";

    if (ref.path) {
      // file or directory
      const res = await fetch(
        `${base}/contents/${encodeURIComponent(ref.path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(defaultBranch)}`,
        { headers: ghHeaders(token), cache: "no-store" }
      );
      if (!res.ok) {
        return { ok: false, label, context: "", error: `contents ${res.status}` };
      }
      const data = (await res.json()) as Array<{ type: string; name: string; path: string }> | {
        type: string;
        encoding?: string;
        content?: string;
        size?: number;
        html_url?: string;
      };
      if (Array.isArray(data)) {
        parts.push(`directory ${ref.path}:\n${data.map((d) => `- ${d.type === "dir" ? "[dir] " : ""}${d.path}`).join("\n")}`);
        snippet = `directory listing (${data.length} entries)`;
      } else if (data.type === "file" && data.content) {
        const text = Buffer.from(data.content, "base64").toString("utf-8");
        parts.push(`file ${ref.path} (first ${Math.min(text.length, MAX_READ_CHARS)} chars):\n${text.slice(0, MAX_READ_CHARS)}`);
        snippet = `file, ${text.length} chars`;
      }
      htmlUrl = `https://github.com/${label}`;
    } else {
      // README
      const readmeRes = await fetch(`${base}/readme?ref=${encodeURIComponent(defaultBranch)}`, {
        headers: { ...ghHeaders(token), Accept: "application/vnd.github.raw+json" },
        cache: "no-store",
      });
      if (readmeRes.ok) {
        const text = await readmeRes.text();
        parts.push(`README (first ${Math.min(text.length, MAX_READ_CHARS)} chars):\n${text.slice(0, MAX_READ_CHARS)}`);
        snippet = snippet || `README, ${text.length} chars`;
      }
    }

    return {
      ok: true,
      label,
      context: `[GH] ${parts.join("\n")}`,
      source: { url: htmlUrl, name: `GitHub: ${label}`, snippet, host_name: "github.com" },
    };
  } catch (err) {
    return {
      ok: false,
      label,
      context: "",
      error: err instanceof Error ? err.message : "github read failed",
    };
  }
}

export interface GhPutResult {
  ok: boolean;
  path: string;
  sha?: string;
  htmlUrl?: string;
  error?: string;
}

function sanitizePath(input: string): string | null {
  const p = input.trim().replace(/^\/+/, "");
  if (!p || p.includes("..") || p.includes("\\") || p.length > 200) return null;
  return p;
}

/** ساخت/به‌روزرسانی یک فایل در مخزن پیش‌فرض از طریق Contents API */
export async function githubPutFile(
  rawPath: string,
  message: string,
  content: string
): Promise<GhPutResult> {
  const { token, defaultRepo } = ghConfig();
  if (!token || !defaultRepo) {
    return { ok: false, path: rawPath, error: "GitHub not configured (GITHUB_TOKEN / GITHUB_REPO)" };
  }
  const path = sanitizePath(rawPath);
  if (!path) return { ok: false, path: rawPath, error: "invalid path" };
  if (!content || content.length > MAX_SAVE_CHARS) {
    return { ok: false, path, error: content ? "content too large" : "empty content" };
  }

  const url = `${GH_API}/repos/${defaultRepo}/contents/${encodeURI(path)}`;
  try {
    // existing file? → need its sha for update
    let sha: string | undefined;
    const getRes = await fetch(url, { headers: ghHeaders(token), cache: "no-store" });
    if (getRes.ok) {
      const data = (await getRes.json()) as { sha?: string };
      sha = data.sha;
    } else if (getRes.status !== 404) {
      return { ok: false, path, error: `read ${getRes.status}` };
    }

    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        message: (message || `Xenon agent: save ${path}`).slice(0, 300),
        content: Buffer.from(content, "utf-8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const body = await putRes.text();
      return { ok: false, path, error: `put ${putRes.status}: ${body.slice(0, 200)}` };
    }
    const data = (await putRes.json()) as {
      content?: { sha?: string; html_url?: string };
      commit?: { sha?: string };
    };
    return {
      ok: true,
      path,
      sha: data.commit?.sha ?? data.content?.sha,
      htmlUrl: data.content?.html_url ?? `https://github.com/${defaultRepo}/blob/main/${path}`,
    };
  } catch (err) {
    return {
      ok: false,
      path,
      error: err instanceof Error ? err.message : "github put failed",
    };
  }
}
