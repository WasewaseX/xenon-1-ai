//! Tauri IPC commands exposed to the React frontend.
//!
//! # Commands
//! | Command | Purpose |
//! |---|---|
//! | `check_ytdlp` | Detect yt-dlp/ffmpeg on PATH, return version + hint |
//! | `fetch_video_info` | `yt-dlp -J <url>` → parsed [`VideoInfo`] |
//! | `start_download` | Spawn yt-dlp, stream progress events, return id |
//! | `cancel_download` | Kill the child process of a running download |
//!
//! # Events (Rust → frontend)
//! - `download-progress` `{ id, percent, status }`
//! - `download-done` `{ id, path }`
//! - `download-error` `{ id, message }`

use std::{
    collections::{BTreeMap, VecDeque},
    path::Path,
    process::ExitStatus,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::download::{
    ActiveDownload, ChildHandle, CancelFlag, DownloadManager, DownloadState, DownloadStatus,
};

/// Hint shown in the UI when yt-dlp cannot be found on PATH.
pub const YTDLP_HINT: &str = "Install yt-dlp: pip install yt-dlp or winget install yt-dlp";

/* ================================================================== */
/* Payload types                                                       */
/* ================================================================== */

/// Result of [`check_ytdlp`].
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub hint: String,
    pub ffmpeg_installed: bool,
}

/// Metadata for one YouTube video, returned by [`fetch_video_info`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub title: String,
    pub uploader: String,
    pub duration_secs: u64,
    pub thumbnail_url: String,
    /// Short human-readable summary of available qualities.
    pub formats_summary: Vec<String>,
}

/// Payload for the `download-progress` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    id: String,
    percent: f64,
    status: String,
}

/// Payload for the `download-done` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DonePayload {
    id: String,
    path: String,
}

/// Payload for the `download-error` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    id: String,
    message: String,
}

/* ================================================================== */
/* Small helpers                                                       */
/* ================================================================== */

/// Monotonic counter used to make download ids unique.
static DOWNLOAD_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Generate a unique download id.
fn next_download_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let seq = DOWNLOAD_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("dl-{nanos}-{seq}")
}

/// Hide the console window when spawning child processes on Windows.
fn configure_no_window(cmd: &mut tokio::process::Command) {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = cmd;
}

/// Run a program with args and return the first stdout line on success.
async fn detect_tool(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args);
    configure_no_window(&mut cmd);

    match cmd.output().await {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let first_line = text.lines().next().unwrap_or("").trim().to_string();
            (!first_line.is_empty()).then_some(first_line)
        }
        _ => None,
    }
}

/// Extract a user-friendly error message from yt-dlp stderr bytes.
fn extract_ytdlp_error(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let error_line = text
        .lines()
        .rev()
        .find(|l| l.trim_start().starts_with("ERROR:"))
        .or_else(|| text.lines().rev().find(|l| !l.trim().is_empty()))
        .map(str::trim)
        .unwrap_or("yt-dlp failed without an error message");

    // Truncate long lines so the UI stays readable (char-boundary safe for
    // multi-byte text, since String::truncate would panic otherwise).
    let mut msg = error_line.to_string();
    if msg.len() > 400 {
        let mut cut = 397;
        while !msg.is_char_boundary(cut) {
            cut -= 1;
        }
        msg.truncate(cut);
        msg.push('…');
    }
    if msg.starts_with("ERROR:") {
        format!("yt-dlp: {}", msg["ERROR:".len()..].trim())
    } else {
        format!("yt-dlp: {msg}")
    }
}

/// Parse a `[download]  42.3% of …` line, returning the percentage.
fn parse_download_percent(line: &str) -> Option<f64> {
    let rest = line.strip_prefix("[download]")?.trim_start();
    let token = rest.split_whitespace().next()?;
    token.strip_suffix('%')?.parse::<f64>().ok()
}

/// Extract a quoted path from a line such as `[Merger] Merging formats into "C:\x.mp4"`.
fn quoted_path_after(line: &str, marker: &str) -> Option<String> {
    let start = line.find(marker)? + marker.len();
    let rest = &line[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/* ================================================================== */
/* Command: check_ytdlp                                                */
/* ================================================================== */

/// Detect yt-dlp (and ffmpeg) on the user's PATH.
///
/// Returns [`ToolStatus`] with an `installed` flag plus a copy-pastable
/// install hint so the UI can guide the user instead of failing silently.
#[tauri::command]
pub async fn check_ytdlp() -> ToolStatus {
    let version = detect_tool("yt-dlp", &["--version"]).await;
    let ffmpeg_installed = detect_tool("ffmpeg", &["-version"])
        .await
        .is_some();

    ToolStatus {
        installed: version.is_some(),
        version,
        hint: YTDLP_HINT.to_string(),
        ffmpeg_installed,
    }
}

/* ================================================================== */
/* Command: fetch_video_info                                           */
/* ================================================================== */

/// Fetch metadata for a YouTube URL by running `yt-dlp -J <url>` and
/// parsing the JSON dump.
#[tauri::command]
pub async fn fetch_video_info(url: String) -> Result<VideoInfo, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("Paste a YouTube URL first.".into());
    }

    let mut cmd = tokio::process::Command::new("yt-dlp");
    cmd.args(["-J", "--no-warnings"]).arg(&url);
    configure_no_window(&mut cmd);

    let out = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to launch yt-dlp ({e}). {YTDLP_HINT}"))?;

    if !out.status.success() {
        return Err(extract_ytdlp_error(&out.stderr));
    }

    let json: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("Could not parse yt-dlp JSON output: {e}"))?;

    Ok(VideoInfo {
        title: json
            .get("title")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Untitled")
            .to_string(),
        uploader: json
            .get("uploader")
            .and_then(serde_json::Value::as_str)
            .or_else(|| json.get("channel").and_then(serde_json::Value::as_str))
            .or_else(|| json.get("uploader_id").and_then(serde_json::Value::as_str))
            .unwrap_or("Unknown")
            .to_string(),
        duration_secs: json
            .get("duration")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0)
            .max(0.0) as u64,
        thumbnail_url: best_thumbnail(&json),
        formats_summary: build_formats_summary(&json),
    })
}

/// Pick the best thumbnail URL from the yt-dlp JSON dump.
fn best_thumbnail(json: &serde_json::Value) -> String {
    if let Some(url) = json.get("thumbnail").and_then(serde_json::Value::as_str) {
        return url.to_string();
    }
    // Fallback: choose the widest entry of the `thumbnails` array.
    json.get("thumbnails")
        .and_then(serde_json::Value::as_array)
        .and_then(|thumbs| {
            thumbs
                .iter()
                .filter_map(|t| {
                    let w = t.get("width").and_then(serde_json::Value::as_u64).unwrap_or(0);
                    let url = t.get("url").and_then(serde_json::Value::as_str)?;
                    Some((w, url))
                })
                .max_by_key(|(w, _)| *w)
                .map(|(_, url)| url.to_string())
        })
        .unwrap_or_default()
}

/// Build a short summary of available qualities: the best MP4 heights
/// (descending) plus the best audio bitrate.
fn build_formats_summary(json: &serde_json::Value) -> Vec<String> {
    let mut best_by_height: BTreeMap<u64, (String, f64)> = BTreeMap::new();
    let mut best_audio: Option<(f64, String)> = None; // (abr, ext)

    if let Some(formats) = json.get("formats").and_then(serde_json::Value::as_array) {
        for f in formats {
            let ext = f.get("ext").and_then(serde_json::Value::as_str).unwrap_or("");
            let vcodec = f
                .get("vcodec")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("none");

            // Video formats: track the highest-bitrate entry per height.
            if let Some(height) = f.get("height").and_then(serde_json::Value::as_u64) {
                if vcodec != "none" {
                    let tbr = f.get("tbr").and_then(serde_json::Value::as_f64).unwrap_or(0.0);
                    let label = if ext.is_empty() { "mp4" } else { ext }.to_string();
                    let entry = best_by_height.entry(height).or_insert((label, tbr));
                    if tbr > entry.1 {
                        *entry = (label, tbr);
                    }
                }
            }

            // Audio-only formats: track the best average bitrate.
            if vcodec == "none" {
                if let Some(abr) = f.get("abr").and_then(serde_json::Value::as_f64) {
                    let better = match &best_audio {
                        Some((best, _)) => abr > *best,
                        None => true,
                    };
                    if better {
                        best_audio = Some((abr, ext.to_string()));
                    }
                }
            }
        }
    }

    let mut summary: Vec<String> = best_by_height
        .iter()
        .rev()
        .take(4)
        .map(|(h, (ext, tbr))| format!("MP4 {h}p · {ext} · ~{tbr:.0} kbps"))
        .collect();

    if let Some((abr, ext)) = best_audio {
        summary.push(format!("Audio {abr:.0} kbps · {ext}"));
    }

    if summary.is_empty() {
        summary.push("No fixed formats (live stream or DRM-protected)".into());
    }
    summary
}

/* ================================================================== */
/* Command: start_download                                             */
/* ================================================================== */

/// Which yt-dlp invocation to perform.
enum Target {
    /// Best video up to the given height, muxed to MP4.
    Video(u32),
    /// Best audio, extracted and converted to MP3.
    Audio,
}

impl Target {
    /// Human-friendly label used in the UI and managed state.
    fn label(&self) -> String {
        match self {
            Target::Video(h) => format!("MP4 · {h}p"),
            Target::Audio => "MP3 · audio only".to_string(),
        }
    }
}

/// Start a download in the background.
///
/// Builds the yt-dlp command for the requested format, spawns it, and
/// returns a download id immediately. Progress is streamed to the frontend
/// through the `download-progress` / `download-done` / `download-error`
/// events.
///
/// # Arguments
/// * `url` — the YouTube URL.
/// * `format` — one of `mp4-1080`, `mp4-720`, `mp4-480`, `mp3`.
/// * `output_dir` — destination folder (created if missing).
#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    url: String,
    format: String,
    output_dir: String,
    manager: State<'_, DownloadManager>,
) -> Result<String, String> {
    // ---- Validate inputs -------------------------------------------------
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("Paste a YouTube URL first.".into());
    }

    let target = match format.as_str() {
        "mp4-1080" => Target::Video(1080),
        "mp4-720" => Target::Video(720),
        "mp4-480" => Target::Video(480),
        "mp3" => Target::Audio,
        other => return Err(format!("Unsupported format '{other}'.")),
    };

    let output_dir = output_dir.trim().to_string();
    if output_dir.is_empty() {
        return Err("Choose a folder to save the download into.".into());
    }

    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|e| format!("Could not create output directory '{output_dir}': {e}"))?;

    // yt-dlp output template: <dir>/%(title)s.%(ext)s
    let out_template: String = Path::new(&output_dir)
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .into_owned();

    // ---- Build the yt-dlp command ---------------------------------------
    let mut cmd = tokio::process::Command::new("yt-dlp");
    match &target {
        Target::Video(h) => {
            cmd.args([
                "-f",
                &format!("bv*[height<={h}]+ba/b[height<={h}]"),
                "--merge-output-format",
                "mp4",
            ]);
        }
        Target::Audio => {
            cmd.args(["-x", "--audio-format", "mp3", "--audio-quality", "0"]);
        }
    }
    cmd.args([
        // Emit every progress update as its own line (parsable).
        "--newline",
        // Force progress output even though stdout is piped, not a TTY.
        "--progress",
        // Never expand playlist URLs into dozens of downloads.
        "--no-playlist",
        "--no-warnings",
        "-o",
        &out_template,
    ])
    .arg(&url)
    // Child streams are consumed by the worker below.
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .stdin(std::process::Stdio::null())
    // If the worker task dies unexpectedly, take the child with it.
    .kill_on_drop(true);
    configure_no_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch yt-dlp ({e}). {YTDLP_HINT}"))?;

    let pid = child.id();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture yt-dlp stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture yt-dlp stderr".to_string())?;

    // ---- Register the download in managed state --------------------------
    let id = next_download_id();
    let child_handle: ChildHandle = Arc::new(tokio::sync::Mutex::new(child));
    let cancel_flag: CancelFlag = Arc::new(AtomicBool::new(false));

    manager.register(
        DownloadState {
            id: id.clone(),
            url: url.clone(),
            format: target.label(),
            pid,
            percent: 0.0,
            status: DownloadStatus::Starting,
            output_path: None,
        },
        ActiveDownload {
            child: child_handle.clone(),
            cancel_requested: cancel_flag.clone(),
        },
    );

    // Immediately surface the initial state to every window.
    let _ = app.emit(
        "download-progress",
        ProgressPayload {
            id: id.clone(),
            percent: 0.0,
            status: "starting".into(),
        },
    );

    // ---- Spawn the worker that streams progress --------------------------
    let worker_app = app.clone();
    let worker_id = id.clone();
    tokio::spawn(run_download_worker(
        worker_app,
        worker_id,
        url,
        target.label(),
        output_dir,
        child_handle,
        cancel_flag,
        stdout,
        stderr,
    ));

    Ok(id)
}

/// Drain yt-dlp stderr into a bounded ring buffer for error reporting.
async fn collect_stderr(stderr: tokio::process::ChildStderr) -> VecDeque<String> {
    const CAPACITY: usize = 20;
    let mut tail: VecDeque<String> = VecDeque::with_capacity(CAPACITY);
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if tail.len() == CAPACITY {
            tail.pop_front();
        }
        tail.push_back(line);
    }
    tail
}

/// Worker task: parse yt-dlp stdout, emit progress events, wait for exit
/// and emit the final `download-done` or `download-error` event.
///
/// Cancellation works by polling `try_wait()` while a separate caller
/// (`cancel_download`) grabs the same `tokio::sync::Mutex` just long enough
/// to call the synchronous `start_kill()`.
#[allow(clippy::too_many_arguments)]
async fn run_download_worker(
    app: AppHandle,
    id: String,
    url: String,
    format: String,
    output_dir: String,
    child: ChildHandle,
    cancel_flag: CancelFlag,
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
) {
    let manager = app.state::<DownloadManager>();

    // Collect stderr in parallel for error reporting later.
    let stderr_task = tokio::spawn(collect_stderr(stderr));

    // ---- Stream stdout ----------------------------------------------------
    let mut reader = BufReader::new(stdout).lines();
    let mut percent = 0.0f64;
    let mut status = DownloadStatus::Downloading;
    let mut last_emitted: (f64, String) = (0.0, String::new());
    let mut final_path: Option<String> = None;

    while let Ok(Some(line)) = reader.next_line().await {
        // Track destination paths as yt-dlp reports them.
        if let Some(p) = line.strip_prefix("[download] Destination: ") {
            final_path = Some(p.trim().to_string());
        } else if let Some(p) = line.strip_prefix("[ExtractAudio] Destination: ") {
            // MP3 mode: the converted file is the real artifact.
            final_path = Some(p.trim().to_string());
        } else if line.starts_with("[Merger]") {
            if let Some(p) = quoted_path_after(line, "Merging formats into \"") {
                final_path = Some(p);
            }
        }

        // Map post-processing lines to statuses.
        let line_status = if line.starts_with("[Merger]") {
            Some(DownloadStatus::Merging)
        } else if line.starts_with("[ExtractAudio]") {
            Some(DownloadStatus::Converting)
        } else {
            None
        };

        if let Some(pct) = parse_download_percent(&line) {
            percent = pct;
            if let Some(st) = line_status {
                status = st;
            }
            let status_str = status_label(&status);
            let delta = (pct - last_emitted.0).abs();
            if status_str != last_emitted.1 || delta >= 0.5 || pct >= 100.0 {
                manager.update(&id, pct, status.clone());
                let _ = app.emit(
                    "download-progress",
                    ProgressPayload {
                        id: id.clone(),
                        percent: pct,
                        status: status_str.to_string(),
                    },
                );
                last_emitted = (pct, status_str.to_string());
            }
        } else if let Some(st) = line_status {
            // Post-processing line without a percentage (e.g. the first
            // `[Merger]` line): emit a status-only update.
            status = st;
            let status_str = status_label(&status);
            if status_str != last_emitted.1 {
                manager.update(&id, percent, status.clone());
                let _ = app.emit(
                    "download-progress",
                    ProgressPayload {
                        id: id.clone(),
                        percent,
                        status: status_str.to_string(),
                    },
                );
                last_emitted = (percent, status_str.to_string());
            }
        }
    }

    // ---- Wait for exit (stdout EOF usually means it just exited) ---------
    let mut exit_status: Option<ExitStatus> = None;
    loop {
        {
            let mut guard = child.lock().await;
            match guard.try_wait() {
                Ok(Some(st)) => {
                    exit_status = Some(st);
                    break;
                }
                Ok(None) => {}
                Err(e) => {
                    // Failed to reap the process — report as failure.
                    let message = format!("yt-dlp process error: {e}");
                    manager.update(&id, percent, DownloadStatus::Failed);
                    let _ = app.emit("download-error", ErrorPayload { id: id.clone(), message });
                    manager.remove_child(&id);
                    return;
                }
            }
        }
        // Brief sleep releases the mutex so `cancel_download` can kill.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    // Join the stderr collector (tolerating a panicked task).
    let stderr_tail: Vec<String> = match stderr_task.await {
        Ok(tail) => tail.into_iter().collect(),
        Err(_) => Vec::new(),
    };

    // ---- Finalize ---------------------------------------------------------
    if cancel_flag.load(Ordering::Relaxed) {
        manager.update(&id, percent, DownloadStatus::Cancelled);
        let _ = app.emit(
            "download-progress",
            ProgressPayload {
                id: id.clone(),
                percent,
                status: "cancelled".into(),
            },
        );
        manager.remove_child(&id);
        return;
    }

    let success = matches!(&exit_status, Some(st) if st.success());
    if success {
        let path = final_path.unwrap_or_else(|| output_dir.clone());
        manager.set_output_path(&id, path.clone());
        manager.update(&id, 100.0, DownloadStatus::Completed);
        let _ = app.emit(
            "download-done",
            DonePayload {
                id: id.clone(),
                path,
            },
        );
    } else {
        let message = error_message_from(stderr_tail, exit_status.as_ref(), &url, &format);
        manager.update(&id, percent, DownloadStatus::Failed);
        let _ = app.emit("download-error", ErrorPayload { id: id.clone(), message });
    }
    manager.remove_child(&id);
}

/// Serde-style status labels shared by progress events.
fn status_label(status: &DownloadStatus) -> &'static str {
    match status {
        DownloadStatus::Starting => "starting",
        DownloadStatus::Downloading => "downloading",
        DownloadStatus::Merging => "merging",
        DownloadStatus::Converting => "converting",
        DownloadStatus::Cancelling => "cancelling",
        DownloadStatus::Cancelled => "cancelled",
        DownloadStatus::Completed => "completed",
        DownloadStatus::Failed => "failed",
    }
}

/// Compose a helpful error message from yt-dlp stderr output.
fn error_message_from(
    stderr_tail: Vec<String>,
    exit_status: Option<&ExitStatus>,
    url: &str,
    format: &str,
) -> String {
    let extracted = extract_ytdlp_error(
        &stderr_tail
            .join("\n")
            .into_bytes(),
    );

    // Detect the classic "ffmpeg missing" failure for nicer guidance.
    let needs_ffmpeg = matches!(format.as_str(), "mp3" | "mp4-1080")
        && stderr_tail
            .iter()
            .any(|l| l.to_lowercase().contains("ffmpeg") && l.to_lowercase().contains("not found"));

    if needs_ffmpeg {
        return "ffmpeg was not found — install it (e.g. winget install Gyan.FFmpeg / \
                apt install ffmpeg / brew install ffmpeg) and retry."
            .to_string();
    }

    let code = exit_status.map(|st| st.code().unwrap_or(-1)).unwrap_or(-1);
    if extracted == "yt-dlp: yt-dlp failed without an error message" {
        format!("yt-dlp exited with code {code} while downloading {url}")
    } else {
        extracted
    }
}

/* ================================================================== */
/* Command: cancel_download                                            */
/* ================================================================== */

/// Cancel a running download by killing its yt-dlp child process.
///
/// Finishing/finished downloads are a no-op (`Ok(())`); unknown ids are an
/// error. The worker notices the killed process and emits a final
/// `download-progress` event with status `cancelled`.
#[tauri::command]
pub async fn cancel_download(
    id: String,
    manager: State<'_, DownloadManager>,
) -> Result<(), String> {
    // Reject unknown ids outright.
    let known = manager
        .downloads
        .lock()
        .expect("downloads mutex poisoned")
        .contains_key(&id);
    if !known {
        return Err(format!("Unknown download id '{id}'."));
    }

    // Take the cancel handle out of the map (also prevents double-cancel).
    let active = manager
        .children
        .lock()
        .expect("children mutex poisoned")
        .remove(&id);

    let Some(active) = active else {
        // No running child: the download already finished.
        return Ok(());
    };

    // Record intent first so the worker reports "cancelled", not "failed".
    active.cancel_requested.store(true, Ordering::Relaxed);

    // start_kill() is synchronous: grab the lock, send SIGKILL/TerminateProcess,
    // release. The worker only holds the lock for its brief try_wait polls.
    {
        let mut guard = active
            .child
            .lock()
            .await;
        let _ = guard.start_kill();
    }

    if let Some(state) = manager
        .downloads
        .lock()
        .expect("downloads mutex poisoned")
        .get_mut(&id)
    {
        if !state.status.is_terminal() {
            state.status = DownloadStatus::Cancelling;
        }
    }

    Ok(())
}

/* ================================================================== */
/* Unit tests for the pure parsing helpers                             */
/* ================================================================== */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_download_percent_lines() {
        assert_eq!(
            parse_download_percent("[download]  42.3% of    3.42MiB at  987.53KiB/s ETA 00:03"),
            Some(42.3)
        );
        assert_eq!(
            parse_download_percent("[download] 100% of    3.42MiB in 00:00:03 at 1.03MiB/s"),
            Some(100.0)
        );
        assert_eq!(
            parse_download_percent("[download]  12.3% of ~   10.00MiB at Unknown B/s"),
            Some(12.3)
        );
    }

    #[test]
    fn ignores_non_progress_lines() {
        assert_eq!(
            parse_download_percent("[download] Destination: /tmp/video.f137.mp4"),
            None
        );
        assert_eq!(parse_download_percent("[Merger] Merging formats into \"x.mp4\""), None);
        assert_eq!(parse_download_percent("random text"), None);
    }

    #[test]
    fn extracts_quoted_merger_path() {
        assert_eq!(
            quoted_path_after(
                "[Merger] Merging formats into \"/home/u/Videos/Cool.mp4\"",
                "Merging formats into \""
            ),
            Some("/home/u/Videos/Cool.mp4".to_string())
        );
        assert_eq!(quoted_path_after("no marker here", "Merging formats into \""), None);
    }

    #[test]
    fn builds_summary_from_typical_youtube_json() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{
                "formats": [
                    { "ext": "mp4", "vcodec": "avc1.640028", "height": 1080, "tbr": 4500 },
                    { "ext": "mp4", "vcodec": "avc1.64002",  "height": 720,  "tbr": 2200 },
                    { "ext": "webm", "vcodec": "vp9", "height": 1080, "tbr": 5000 },
                    { "ext": "m4a", "vcodec": "none", "abr": 128.0 },
                    { "ext": "webm", "vcodec": "none", "abr": 160.0 }
                ]
            }"#,
        )
        .unwrap();
        let summary = build_formats_summary(&json);
        // 2 distinct video heights + 1 best audio entry.
        assert_eq!(summary.len(), 3);
        assert!(summary[0].starts_with("MP4 1080p"));
        assert!(summary.contains(&"Audio 160 kbps · webm".to_string()));
    }

    #[test]
    fn extracts_error_lines() {
        let stderr = b"WARNING: something\nERROR: Video unavailable\n[youtube] id: x\n";
        assert_eq!(
            extract_ytdlp_error(stderr),
            "yt-dlp: Video unavailable"
        );
    }
}
