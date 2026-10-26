// Xenon 1 AI — Text-to-Speech API
// تبدیل متن فارسی/انگلیسی به گفتار طبیعی

import { NextRequest } from "next/server";
import { tts } from "@/lib/xenon/llm";
import { mapUpstreamError } from "@/lib/xenon/language-guard";
import { db } from "@/lib/db";

// حذف ساختار Markdown و بلوک‌های کد برای خوانش طبیعی
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (بخش کد از پخش صوتی حذف شد) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? stripMarkdown(body.text) : "";
  if (!text) {
    return Response.json({ error: "متن خالی است" }, { status: 400 });
  }
  if (text.length > 1200) {
    return Response.json({ error: "متن برای تبدیل به گفتار بیش از حد بلند است (حداکثر ۱۲۰۰ نویسه)" }, { status: 400 });
  }

  try {
    const result = await tts(text);
    if (!result) {
      return Response.json({ error: "درگاه تبدیل متن به گفتار پاسخ معتبری برنگرداند" }, { status: 502 });
    }
    db.usageEvent.create({ data: { kind: "tts" } }).catch(() => undefined);
    return Response.json({ audio: result.base64, format: result.format });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    return Response.json({ error: `تولید گفتار ناموفق بود: ${mapUpstreamError(message, "درگاه گفتار موقتاً در دسترس نیست؛ بعداً تلاش کن.")}` }, { status: 502 });
  }
}
