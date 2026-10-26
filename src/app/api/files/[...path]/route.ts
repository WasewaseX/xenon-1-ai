// Xenon 1 AI — File Serving API
// سرو فایل‌های آپلودشده با محافظت از مسیر (path traversal)

import { NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ path: string[] }> };

const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp",
  wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", webm: "audio/webm",
  m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
  json: "application/json", csv: "text/csv", xml: "application/xml",
  yml: "text/yaml", yaml: "text/yaml",
  ts: "text/plain; charset=utf-8", tsx: "text/plain; charset=utf-8",
  js: "text/plain; charset=utf-8", jsx: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8", css: "text/plain; charset=utf-8", html: "text/plain; charset=utf-8",
  sql: "text/plain; charset=utf-8", sh: "text/plain; charset=utf-8",
  go: "text/plain; charset=utf-8", rs: "text/plain; charset=utf-8",
  java: "text/plain; charset=utf-8", c: "text/plain; charset=utf-8", cpp: "text/plain; charset=utf-8",
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { path: parts } = await params;
  const UPLOAD_DIR = path.join(process.cwd(), "upload");

  const filename = path.basename(parts.join("/"));
  const full = path.join(UPLOAD_DIR, filename);
  if (!full.startsWith(UPLOAD_DIR)) {
    return new Response("دسترسی غیرمجاز", { status: 403 });
  }

  try {
    const info = await stat(full);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(full);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME_MAP[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(info.size),
      },
    });
  } catch {
    return new Response("فایل یافت نشد", { status: 404 });
  }
}
