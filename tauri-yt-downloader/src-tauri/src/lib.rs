//! # xenon_yt_downloader
//!
//! Tauri v2 desktop application that downloads YouTube video (MP4) or
//! audio (MP3) files by driving `yt-dlp` as a child process.
//!
//! Module layout:
//! - [`download`] — managed state (`DownloadManager`, `DownloadState`)
//!   and per-download bookkeeping.
//! - [`commands`] — Tauri IPC commands invoked from the React frontend.
//!
//! Event contract (emitted from Rust, consumed by the frontend):
//! - `download-progress` — `{ id, percent, status }`
//! - `download-done`     — `{ id, path }`
//! - `download-error`    — `{ id, message }`

pub mod commands;
pub mod download;

use download::DownloadManager;
use tauri::Manager;

/// Application entry point: registers plugins, managed state and IPC
/// commands, then runs the Tauri event loop.
pub fn run() {
    let app = tauri::Builder::default()
        // Plugins used by the frontend (folder picker, fs, shell scopes):
        .plugin(tauri_plugin_dialog::init()) // native open/folder dialogs
        .plugin(tauri_plugin_fs::init()) // filesystem access
        .plugin(tauri_plugin_shell::init()) // shell scopes (yt-dlp/ffmpeg)
        // Shared download bookkeeping, mutated by the commands below.
        .manage(DownloadManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::check_ytdlp,
            commands::fetch_video_info,
            commands::start_download,
            commands::cancel_download,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the YT Downloader application");

    app.run(|app_handle, event| {
        // Make sure no yt-dlp child processes are orphaned on exit.
        if let tauri::RunEvent::Exit = event {
            app_handle.state::<DownloadManager>().kill_all();
        }
    });
}
