//! Managed application state for downloads.
//!
//! [`DownloadManager`] is registered with Tauri via `.manage(...)` and holds:
//! - `downloads`: a `Mutex<HashMap<String, DownloadState>>` with progress /
//!   status bookkeeping for every download of this session.
//! - `children`: cancel handles for downloads that are still running,
//!   keyed by download id.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

use serde::Serialize;
use tokio::process::Child;

/// Lifecycle of a single download.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    /// Registered, child process about to spawn.
    Starting,
    /// Media bytes are being fetched.
    Downloading,
    /// yt-dlp is merging separate video+audio streams (MP4 mode).
    Merging,
    /// yt-dlp is converting/extracting audio (MP3 mode).
    Converting,
    /// A cancel was requested, waiting for the child to exit.
    Cancelling,
    /// Terminal states.
    Cancelled,
    Completed,
    Failed,
}

impl DownloadStatus {
    /// `true` when the download reached a terminal state.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            DownloadStatus::Cancelled | DownloadStatus::Completed | DownloadStatus::Failed
        )
    }
}

/// Bookkeeping for one download (running or finished).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadState {
    pub id: String,
    pub url: String,
    /// Human-friendly format label, e.g. `MP4 · 1080p`.
    pub format: String,
    /// OS process id of the yt-dlp child, when known.
    pub pid: Option<u32>,
    /// Latest progress percentage (0.0 – 100.0).
    pub percent: f64,
    pub status: DownloadStatus,
    /// Best-known output file path (captured from yt-dlp output).
    pub output_path: Option<String>,
}

/// Everything needed to cancel a still-running download.
///
/// The child is shared behind a `tokio::sync::Mutex` so the worker task can
/// hold it briefly to poll `try_wait()`, while `cancel_download` can acquire
/// it just long enough to call `start_kill()` (a synchronous, non-blocking
/// call). The flag records *intent* so the worker can distinguish a
/// cancellation from a crash.
pub struct ActiveDownload {
    pub child: ChildHandle,
    pub cancel_requested: CancelFlag,
}

/// Shared handle to the yt-dlp child process.
pub type ChildHandle = std::sync::Arc<tokio::sync::Mutex<Child>>;

/// Shared cancellation flag.
pub type CancelFlag = std::sync::Arc<AtomicBool>;

/// State managed by Tauri (`app.state::<DownloadManager>()`).
#[derive(Default)]
pub struct DownloadManager {
    /// Bookkeeping for every download this session, keyed by id.
    pub downloads: Mutex<HashMap<String, DownloadState>>,
    /// Cancel handles for downloads that are still running, keyed by id.
    pub children: Mutex<HashMap<String, ActiveDownload>>,
}

impl DownloadManager {
    /// Insert bookkeeping for a new download.
    pub fn register(&self, state: DownloadState, active: ActiveDownload) {
        let id = state.id.clone();
        self.downloads
            .lock()
            .expect("downloads mutex poisoned")
            .insert(id.clone(), state);
        self.children
            .lock()
            .expect("children mutex poisoned")
            .insert(id, active);
    }

    /// Update the progress/status of a download (no-op if unknown).
    pub fn update(&self, id: &str, percent: f64, status: DownloadStatus) {
        if let Some(state) = self
            .downloads
            .lock()
            .expect("downloads mutex poisoned")
            .get_mut(id)
        {
            state.percent = percent;
            state.status = status;
        }
    }

    /// Record the resolved output path of a download.
    pub fn set_output_path(&self, id: &str, path: String) {
        if let Some(state) = self
            .downloads
            .lock()
            .expect("downloads mutex poisoned")
            .get_mut(id)
        {
            state.output_path = Some(path);
        }
    }

    /// Drop the cancel handle for a download whose worker has finished.
    pub fn remove_child(&self, id: &str) {
        self.children
            .lock()
            .expect("children mutex poisoned")
            .remove(id);
    }

    /// Kill every running child process (used on application exit).
    ///
    /// Uses `try_lock` because this runs on the main thread during shutdown;
    /// any child currently locked by its worker will simply be dropped
    /// (`kill_on_drop(true)` is set on the command builder).
    pub fn kill_all(&self) {
        let mut children = self.children.lock().expect("children mutex poisoned");
        for (_, active) in children.drain() {
            if let Ok(mut guard) = active.child.try_lock() {
                let _ = guard.start_kill();
            }
        }
    }

    /// Read the cancel flag of a download, if it has one.
    pub fn cancel_requested(&self, id: &str) -> bool {
        self.children
            .lock()
            .expect("children mutex poisoned")
            .get(id)
            .is_some_and(|active| active.cancel_requested.load(Ordering::Relaxed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_states_are_recognized() {
        assert!(DownloadStatus::Completed.is_terminal());
        assert!(DownloadStatus::Failed.is_terminal());
        assert!(DownloadStatus::Cancelled.is_terminal());
        assert!(!DownloadStatus::Downloading.is_terminal());
        assert!(!DownloadStatus::Merging.is_terminal());
    }
}
