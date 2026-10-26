import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";

/* ------------------------------------------------------------------ */
/* Types mirroring the Rust command payloads (serde camelCase)         */
/* ------------------------------------------------------------------ */

/** Result of the `check_ytdlp` command. */
interface ToolStatus {
  installed: boolean;
  version: string | null;
  hint: string;
  ffmpegInstalled: boolean;
}

/** Result of the `fetch_video_info` command. */
interface VideoInfo {
  title: string;
  uploader: string;
  durationSecs: number;
  thumbnailUrl: string;
  formatsSummary: string[];
}

/** Payload of the `download-progress` event emitted from Rust. */
interface ProgressPayload {
  id: string;
  percent: number;
  status: "starting" | "downloading" | "merging" | "converting" | "cancelled";
}

/** Payload of the `download-done` event. */
interface DonePayload {
  id: string;
  path: string;
}

/** Payload of the `download-error` event. */
interface ErrorPayload {
  id: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Format catalogue + UI row state                                     */
/* ------------------------------------------------------------------ */

type FormatId = "mp4-1080" | "mp4-720" | "mp4-480" | "mp3";

const FORMATS: ReadonlyArray<{ id: FormatId; label: string; sub: string }> = [
  { id: "mp4-1080", label: "MP4", sub: "1080p" },
  { id: "mp4-720", label: "MP4", sub: "720p" },
  { id: "mp4-480", label: "MP4", sub: "480p" },
  { id: "mp3", label: "MP3", sub: "audio only" },
];

interface DownloadRow {
  id: string;
  label: string;
  percent: number;
  status: string;
  path?: string;
  error?: string;
}

interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Format seconds as m:ss or h:mm:ss. */
function fmtDuration(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "—";
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [format, setFormat] = useState<FormatId>("mp4-1080");
  const [outputDir, setOutputDir] = useState("");
  const [dirWarning, setDirWarning] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [tool, setTool] = useState<ToolStatus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toastSeq = useRef(0);

  /** Push a transient toast message (auto-dismissed after 4.5 s). */
  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  /* ---------------- Environment check (yt-dlp / ffmpeg) ------------ */

  useEffect(() => {
    let cancelled = false;
    invoke<ToolStatus>("check_ytdlp")
      .then((status) => {
        if (!cancelled) setTool(status);
      })
      .catch(() => {
        if (!cancelled) setTool(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- Default output folder (Downloads) -------------- */

  useEffect(() => {
    let cancelled = false;
    downloadDir()
      .then((dir) => {
        if (!cancelled) setOutputDir(dir);
      })
      .catch(() => {
        // Non-fatal: the user can pick a folder manually.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- Tauri event subscriptions ---------------------- */

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    // Guard against a race where the effect is cleaned up before the async
    // listen() promises resolve (React StrictMode double-mounts in dev).
    let disposed = false;

    const register = async () => {
      const l1 = await listen<ProgressPayload>("download-progress", (event) => {
          const { id, percent, status } = event.payload;
          setRows((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, percent, status: status as string }
                : r,
            ),
          );
        });
      if (disposed) { l1(); return; }
      unlisteners.push(l1);

      const l2 = await listen<DonePayload>("download-done", (event) => {
          const { id, path } = event.payload;
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: "completed", percent: 100, path } : r,
            ),
          );
          const fileName = path.split(/[\\/]/).pop() ?? path;
          pushToast("success", `Download complete: ${fileName}`);
        });
      if (disposed) { l2(); return; }
      unlisteners.push(l2);

      const l3 = await listen<ErrorPayload>("download-error", (event) => {
          const { id, message } = event.payload;
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: "failed", error: message } : r,
            ),
          );
          pushToast("error", message);
        });
      if (disposed) { l3(); return; }
      unlisteners.push(l3);
    };

    void register();
    return () => {
      disposed = true;
      for (const un of unlisteners) un();
    };
  }, [pushToast]);

  /* ---------------- Actions ----------------------------------------- */

  const fetchInfo = useCallback(async () => {
    const target = url.trim();
    if (!target) {
      setInfoError("Paste a YouTube URL first.");
      return;
    }
    setInfoLoading(true);
    setInfoError(null);
    setInfo(null);
    try {
      const result = await invoke<VideoInfo>("fetch_video_info", { url: target });
      setInfo(result);
    } catch (err) {
      setInfoError(String(err));
    } finally {
      setInfoLoading(false);
    }
  }, [url]);

  const chooseDir = useCallback(async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose download folder",
    });
    if (typeof picked === "string") {
      setOutputDir(picked);
      // Informational only — the Rust side creates the folder if missing.
      // The fs plugin scope may deny arbitrary paths; treat denial as "ok".
      try {
        setDirWarning((await exists(picked)) ? null : "Folder will be created on download.");
      } catch {
        setDirWarning(null);
      }
    }
  }, []);

  const startDownload = useCallback(async () => {
    const target = url.trim();
    if (!target) {
      setInfoError("Paste a YouTube URL first.");
      return;
    }
    if (!outputDir.trim()) {
      setDirWarning("Choose a folder to save the download into.");
      return;
    }
    setStarting(true);
    try {
      // NOTE: Tauri v2 maps JS camelCase args to Rust snake_case params
      // (outputDir -> output_dir).
      const id = await invoke<string>("start_download", {
        url: target,
        format,
        outputDir: outputDir.trim(),
      });
      const fmt = FORMATS.find((f) => f.id === format);
      setRows((prev) => [
        {
          id,
          label: info?.title ?? target,
          percent: 0,
          status: "starting",
        },
        ...prev,
      ]);
      pushToast("success", `Started ${fmt ? `${fmt.label} ${fmt.sub}` : format} download`);
    } catch (err) {
      pushToast("error", String(err));
    } finally {
      setStarting(false);
    }
  }, [url, outputDir, format, info, pushToast]);

  const cancelDownload = useCallback(async (id: string) => {
    try {
      await invoke("cancel_download", { id });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "cancelling" } : r)),
      );
    } catch (err) {
      pushToast("error", String(err));
    }
  }, [pushToast]);

  /* ---------------- Render ------------------------------------------ */

  return (
    <div className="app">
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />

      <header className="header">
        <div className="brand">
          <div className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </div>
          <div>
            <h1>YT Downloader</h1>
            <p className="tagline">Save YouTube video &amp; audio locally, powered by yt-dlp</p>
          </div>
        </div>
        {tool && (
          <span
            className={`badge ${tool.installed ? "ok" : "bad"}`}
            title={tool.installed ? `yt-dlp ${tool.version}` : tool.hint}
          >
            {tool.installed ? `yt-dlp ${tool.version ?? ""}` : "yt-dlp missing"}
          </span>
        )}
      </header>

      {tool && !tool.installed && (
        <div className="banner warn" role="alert">
          <strong>yt-dlp was not found on your PATH.</strong>
          <span>{tool.hint}</span>
        </div>
      )}
      {tool && tool.installed && !tool.ffmpegInstalled && (
        <div className="banner info" role="status">
          <strong>ffmpeg was not found.</strong>
          <span>Best-quality merging (1080p) and MP3 conversion require ffmpeg on your PATH.</span>
        </div>
      )}

      <main className="card">
        <label className="field-label" htmlFor="url">YouTube URL</label>
        <div className="url-row">
          <input
            id="url"
            type="text"
            value={url}
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fetchInfo();
            }}
          />
          <button className="btn ghost" onClick={() => void fetchInfo()} disabled={infoLoading}>
            {infoLoading ? "Fetching…" : "Fetch"}
          </button>
        </div>
        {infoError && <p className="field-error">{infoError}</p>}

        {info && (
          <div className="preview">
            {info.thumbnailUrl ? (
              <img
                className="thumb"
                src={info.thumbnailUrl}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <div className="thumb thumb-ph" aria-hidden="true" />
            )}
            <div className="meta">
              <h2 title={info.title}>{info.title}</h2>
              <p>
                {info.uploader}
                <span className="dot">·</span>
                {fmtDuration(info.durationSecs)}
              </p>
              <div className="chips">
                {info.formatsSummary.map((f) => (
                  <span className="chip" key={f}>{f}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <label className="field-label">Format</label>
        <div className="formats" role="radiogroup" aria-label="Download format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={format === f.id}
              className={`fmt ${format === f.id ? "selected" : ""}`}
              onClick={() => setFormat(f.id)}
            >
              <span className="fmt-label">{f.label}</span>
              <span className="fmt-sub">{f.sub}</span>
            </button>
          ))}
        </div>

        <label className="field-label">Save to</label>
        <div className="dir-row">
          <span className="dir-path" title={outputDir}>{outputDir || "Choose a folder…"}</span>
          <button className="btn ghost" onClick={() => void chooseDir()}>Choose…</button>
        </div>
        {dirWarning && <p className="field-hint">{dirWarning}</p>}

        <button
          className="btn primary"
          onClick={() => void startDownload()}
          disabled={starting}
        >
          {starting ? "Starting…" : "Download"}
        </button>
      </main>

      {rows.length > 0 && (
        <section className="downloads" aria-label="Downloads">
          <h3>Downloads</h3>
          {rows.map((row) => {
            const active =
              !TERMINAL.has(row.status) && row.status !== "cancelling";
            return (
              <div className="dl-row" key={row.id}>
                <div className="dl-top">
                  <span className="dl-label" title={row.label}>{row.label}</span>
                  <span className={`dl-status s-${row.status}`}>
                    {row.status}
                    {row.status === "downloading" ? ` ${row.percent.toFixed(1)}%` : ""}
                  </span>
                  {active && (
                    <button className="btn tiny" onClick={() => void cancelDownload(row.id)}>
                      Cancel
                    </button>
                  )}
                </div>
                <div className="bar">
                  <div
                    className={`fill f-${row.status}`}
                    style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                  />
                </div>
                {row.path && (
                  <button
                    className="dl-path"
                    title="Click to copy path"
                    onClick={() => void navigator.clipboard.writeText(row.path ?? "")}
                  >
                    {row.path}
                  </button>
                )}
                {row.error && <p className="dl-error">{row.error}</p>}
              </div>
            );
          })}
        </section>
      )}

      <footer className="footer">
        <span>Personal use only — respect content owners and YouTube&apos;s Terms of Service.</span>
      </footer>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
