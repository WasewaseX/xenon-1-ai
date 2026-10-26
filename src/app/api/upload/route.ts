// Xenon 1 AI — File Upload API
// آپلود امن فایل: تصویر، صوت و فایل متنی

import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { AttachmentMeta } from "@/lib/xenon/types";

const UPLOAD_DIR = path.join(process.cwd(), "upload");
const MAX_SIZE = 12 * 1024 * 1024; // ۱۲ مگابایت

const ALLOWED_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp",
  "wav", "mp3", "ogg", "webm", "m4a", "aac", "flac",
  "txt", "md", "json", "csv", "xml", "yml", "yaml",
  "ts", "tsx", "js", "jsx", "py", "css", "html", "sql", "sh", "go", "rs", "java", "c", "cpp",
]);

function inferKind(mime: string, ext: string): AttachmentMeta["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/") || ["json", "csv", "xml", "yml", "yaml", "ts", "tsx", "js", "jsx", "py", "css", "html", "sql", "sh", "go", "rs", "java", "c", "cpp", "md", "txt"].includes(ext))
    return "text";
  return "other";
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp",
    wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", webm: "audio/webm",
    m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
    txt: "text/plain", md: "text/markdown", json: "application/json", csv: "text/csv",
    xml: "application/xml", yml: "text/yaml", yaml: "text/yaml",
    ts: "text/typescript", tsx: "text/typescript", js: "text/javascript", jsx: "text/javascript",
    py: "text/x-python", css: "text/css", html: "text/html", sql: "text/sql", sh: "text/x-shellscript",
    go: "text/x-go", rs: "text/x-rust", java: "text/x-java", c: "text/x-c", cpp: "text/x-c++",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "فایلی ارسال نشده است" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "حجم فایل بیش از ۱۲ مگابایت است" }, { status: 413 });
  }

  const originalName = file.name || "فایل";
  const ext = (originalName.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return Response.json(
      { error: `پسوند «${ext || "نامشخص"}» پشتیبانی نمی‌شود. فرمت‌های مجاز: تصویر، صوت و فایل‌های متنی/کد` },
      { status: 415 }
    );
  }

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const storedName = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, storedName), buffer);

    const meta: AttachmentMeta = {
      id: randomUUID(),
      name: originalName.slice(0, 120),
      type: file.type || guessMime(ext),
      size: file.size,
      url: `/api/files/${storedName}`,
      kind: inferKind(file.type || guessMime(ext), ext),
    };
    return Response.json(meta);
  } catch {
    return Response.json({ error: "ذخیره فایل ناموفق بود" }, { status: 500 });
  }
}
