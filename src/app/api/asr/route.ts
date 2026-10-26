// Xenon 1 AI — Speech-to-Text API
// تبدیل گفتار به متن (فارسی/انگلیسی)

import { NextRequest } from "next/server";
import { asr } from "@/lib/xenon/llm";
import { mapUpstreamError } from "@/lib/xenon/language-guard";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const base64 = typeof body.file_base64 === "string" ? body.file_base64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!base64) {
    return Response.json({ error: "فایل صوتی ارسال نشده است" }, { status: 400 });
  }
  // حدود ۲۰ مگابایت خروجی base64 سقف است
  if (base64.length > 20 * 1024 * 1024) {
    return Response.json({ error: "فایل صوتی بیش از حد بزرگ است" }, { status: 413 });
  }

  try {
    const text = await asr(base64);
    db.usageEvent.create({ data: { kind: "asr" } }).catch(() => undefined);
    return Response.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    return Response.json({ error: `تشخیص گفتار ناموفق بود: ${mapUpstreamError(message, "درگاه تشخیص گفتار موقتاً در دسترس نیست.")}` }, { status: 502 });
  }
}
