// Xenon 1 AI — Image Generation API
// تولید تصویر از توصیف متنی
// توضیح: درگاه تصویرسازی با پرامپت انگلیسی بهتر کار می‌کند و فیلتر محتوای آن
// گاهی متن فارسی را به‌اشتباه رد می‌کند؛ بنابراین توصیف فارسی پیش از ارسال
// به انگلیسی ترجمه می‌شود و خطای فیلتر با پیام فارسی شفاف بازگردانده می‌شود.

import { NextRequest } from "next/server";
import { generateImage, complete } from "@/lib/xenon/llm";
import { findCjkCharacters } from "@/lib/xenon/language-guard";
import { db } from "@/lib/db";

const SIZES = ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"] as const;
type Size = (typeof SIZES)[number];

function mapUpstreamError(message: string): string {
  // هرگز نویسه چینی را به کاربر نشان نده — سیاست سازگاری زبان
  if (findCjkCharacters(message).length > 0) {
    return "فیلتر محتوای درگاه تصویرسازی این درخواست را نپذیرفت. لطفاً توصیف دیگری و بدون مضامین حساس بنویس.";
  }
  return message;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1500) : "";
  if (!prompt) {
    return Response.json({ error: "توصیف تصویر خالی است" }, { status: 400 });
  }
  const size: Size = SIZES.includes(body.size) ? body.size : "1024x1024";

  // ترجمه توصیف فارسی به انگلیسی برای مدل تصویرساز
  let finalPrompt = prompt;
  let wasTranslated = false;
  const faChars = (prompt.match(/[\u0600-\u06FF]/g) ?? []).length;
  const enChars = (prompt.match(/[A-Za-z]/g) ?? []).length;
  if (faChars >= enChars && faChars > 0) {
    try {
      const { content } = await complete(
        [
          {
            role: "system",
            content:
              "Translate the user's image description into a concise, vivid English prompt for an image generation model. Output ONLY the English prompt text, nothing else. Keep proper nouns transliterated.",
          },
          { role: "user", content: prompt },
        ],
        { thinking: false }
      );
      const clean = content.trim().replace(/^["']|["']$/g, "");
      if (clean && findCjkCharacters(clean).length === 0) {
        finalPrompt = clean.slice(0, 900);
        wasTranslated = true;
      }
    } catch {
      // ترجمه ناموفق — با متن اصلی تلاش می‌کنیم
    }
  }

  try {
    const images = await generateImage(finalPrompt, size);
    if (images.length === 0) {
      return Response.json({ error: "تولید تصویر نتیجه‌ای برنگرداند" }, { status: 502 });
    }
    db.usageEvent.create({ data: { kind: "image", detail: size } }).catch(() => undefined);
    return Response.json({
      images: images.map((img) => ({ base64: img.base64, mime: img.mime })),
      usedPrompt: finalPrompt,
      wasTranslated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";

    // تلاش دوم با متن اصلی اگر ترجمه انجام شده بود و خطای فیلتر دادیم
    if (wasTranslated) {
      try {
        const images = await generateImage(prompt, size);
        if (images.length > 0) {
          db.usageEvent.create({ data: { kind: "image", detail: size } }).catch(() => undefined);
          return Response.json({
            images: images.map((img) => ({ base64: img.base64, mime: img.mime })),
            usedPrompt: prompt,
            wasTranslated: false,
          });
        }
      } catch {
        // ادامه به خطا
      }
    }

    return Response.json({ error: `تولید تصویر ناموفق بود: ${mapUpstreamError(message)}` }, { status: 502 });
  }
}
