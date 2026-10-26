# YT Downloader (Tauri v2 + Rust)

A production-quality **Tauri v2** desktop application that downloads YouTube
**video (MP4)** or **audio (MP3)** by driving [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
as a child process. Features a dark, violet-accented React UI with live
per-download progress, cancellation, and native folder picking.

> Part of the **Xenon 1** project workspace. This is a standalone app — it does
> not share code with the Next.js web app that lives next to it.

---

## Features

- **URL fetch** — paste a link, see title, uploader, duration, thumbnail and a
  summary of available qualities (parsed from `yt-dlp -J`).
- **Formats** — MP4 1080p / 720p / 480p (best video + best audio muxed to MP4)
  and MP3 audio-only (best quality, `-x --audio-format mp3 --audio-quality 0`).
- **Live progress** — the Rust backend parses yt-dlp output and emits Tauri
  events; the UI renders per-download progress bars (including
  *merging* / *converting* stages).
- **Cancellation** — kill a running download from the UI at any time.
- **Environment check** — on startup the app verifies `yt-dlp` (and `ffmpeg`)
  are on your PATH and shows an actionable hint if not.
- **Safe shutdown** — running downloads are killed when the app exits, so no
  orphaned `yt-dlp` processes are left behind.

## Project structure

```
tauri-yt-downloader/
├── package.json                  # npm scripts + JS deps
├── vite.config.ts                # Vite dev server on :5173
├── tsconfig.json                 # strict TypeScript
├── index.html                    # Vite entry
├── src/
│   ├── main.tsx                  # React bootstrap
│   ├── App.tsx                   # whole UI (URL, formats, downloads, toasts)
│   └── App.css                   # dark theme, violet accent (#8b5cf6)
└── src-tauri/
    ├── Cargo.toml                # tauri 2, plugins, tokio, serde, thiserror
    ├── build.rs                  # tauri_build::build()
    ├── tauri.conf.json           # v2 config (window, CSP, bundler, icons)
    ├── capabilities/default.json # v2 capability: core/dialog/fs/shell scopes
    └── src/
        ├── main.rs               # thin entry -> xenon_yt_downloader::run()
        ├── lib.rs                # builder, plugins, managed state, handler
        ├── commands.rs           # check_ytdlp, fetch_video_info,
        │                         # start_download, cancel_download
        └── download.rs           # DownloadManager + DownloadState (Mutex<HashMap>)
```

## Prerequisites

| Requirement | Notes |
|---|---|
| **Rust** | Install via [rustup](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` (Windows: download `rustup-init.exe`). Rust 1.77.2+ |
| **Node.js** | 18 or newer (`node -v`) |
| **yt-dlp** | Must be on your **PATH**. `pip install yt-dlp` or `winget install yt-dlp` or `brew install yt-dlp`. Verify: `yt-dlp --version` |
| **ffmpeg** | Required for best-quality merging (1080p) and MP3 conversion. `winget install Gyan.FFmpeg` / `apt install ffmpeg` / `brew install ffmpeg` |
| Linux only | Tauri system deps: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |

## Build & run

```bash
cd tauri-yt-downloader
npm install          # install JS dependencies
npm run tauri dev    # development: hot-reloading UI + Rust
npm run tauri build  # production build + platform installers
```

**Where the installers appear** after `npm run tauri build`:

```
src-tauri/target/release/bundle/
├── msi/      YT Downloader_0.1.0_x64_en-US.msi     (Windows)
├── nsis/     YT Downloader_0.1.0_x64-setup.exe     (Windows)
├── deb/      yt-downloader_0.1.0_amd64.deb         (Linux)
├── rpm/      yt-downloader-0.1.0-1.x86_64.rpm      (Linux)
├── appimage/ yt-downloader_0.1.0_amd64.AppImage    (Linux)
└── dmg/      YT Downloader.app / .dmg              (macOS)
```

The raw binary is at `src-tauri/target/release/` (plus `.exe` on Windows).

## Icons

A placeholder icon set (derived from the Xenon artwork in
`../public/images/xenon-icon.png`) already lives in `src-tauri/icons/`
(`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`,
`icon.icns`).

To ship your own artwork, put a **1024×1024 PNG** somewhere and run:

```bash
npm run tauri icon path/to/my-icon.png
```

This regenerates every size/format into `src-tauri/icons/` automatically.

## How it works (Rust ↔ UI contract)

| IPC | Direction | Payload |
|---|---|---|
| `check_ytdlp` (invoke) | UI → Rust | → `{ installed, version, hint, ffmpegInstalled }` |
| `fetch_video_info` (invoke) | UI → Rust | args `{ url }` → `{ title, uploader, durationSecs, thumbnailUrl, formatsSummary[] }` |
| `start_download` (invoke) | UI → Rust | args `{ url, format, outputDir }` → `string` download id |
| `cancel_download` (invoke) | UI → Rust | args `{ id }` |
| `download-progress` (event) | Rust → UI | `{ id, percent, status }` — status: `starting`, `downloading`, `merging`, `converting`, `cancelled` |
| `download-done` (event) | Rust → UI | `{ id, path }` |
| `download-error` (event) | Rust → UI | `{ id, message }` |

Under the hood, `start_download` spawns:

- **Video:** `yt-dlp -f "bv*[height<=H]+ba/b[height<=H]" --merge-output-format mp4 --newline --progress --no-playlist -o "<dir>/%(title)s.%(ext)s" <url>`
- **Audio:** `yt-dlp -x --audio-format mp3 --audio-quality 0 --newline --progress --no-playlist -o "<dir>/%(title)s.%(ext)s" <url>`

stdout is parsed line-by-line for `[download] xx.x%`, `[Merger] …` and
`[ExtractAudio] …` markers, which drive the progress events.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Banner “yt-dlp was not found” | Install yt-dlp (`pip install yt-dlp` or `winget install yt-dlp`), then **restart the app** — PATH changes require a new process. Check with `yt-dlp --version` in a fresh terminal. |
| 1080p fails / “ffmpeg was not found” | Install ffmpeg (see prerequisites) and restart the app. 480p usually works without it. |
| `Requested format is not available` | Old yt-dlp. Run `yt-dlp -U` (or `pip install -U yt-dlp`) — **YouTube changes frequently, so keep yt-dlp updated**; stale builds break within days. |
| HTTP 403 / “Sign in to confirm you're not a bot” | Update yt-dlp (`yt-dlp -U`). If it persists, YouTube is throttling your IP — try later or a different network. |
| `npm run tauri dev` fails on Linux | Install the Tauri system dependencies listed above (webkit2gtk 4.1 etc.). |
| Windows SmartScreen warns about the installer | Expected for unsigned builds — click *More info → Run anyway*, or sign the binary. |
| Download finishes but file missing | The final path is shown on the completed row (click to copy). If yt-dlp never reported a path, the row falls back to the chosen folder — look for `%(title)s.mp4` there. |
| Port 5173 in use | `npm run tauri dev` needs Vite on **5173** (strict port). Stop the other process. |

## Notes & limitations

- **Keep yt-dlp updated** (`yt-dlp -U` regularly). YouTube changes extraction
  logic frequently; an outdated yt-dlp is the #1 cause of download failures.
- Downloading YouTube content may violate YouTube's Terms of Service and/or
  copyright law depending on your jurisdiction and the content. **Use it only
  for content you own or that is explicitly licensed for download.**
- The bundled icon set is a placeholder derived from the Xenon project icon;
  regenerate with `npm run tauri icon` before distributing.
- Thumbnails are loaded from `i.ytimg.com`; the CSP in `tauri.conf.json`
  allows that origin specifically.
- This app was authored without a Rust toolchain in the sandbox (source is
  ready to compile but `cargo build` was never run here — see worklog).
