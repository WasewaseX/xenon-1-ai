// Xenon 1 AI — Language Consistency Guard
// نگهبان سازگاری زبان: تشخیص نویسه‌های چینی/ژاپنی ناخواسته و ابزارهای فارسی
// این ماژول روی هر پاسخ دستیار در سمت سرور اجرا می‌شود.

// بازه‌های نویسه CJK: ایده‌گرام‌های چینی، جایگزن‌های سازگار،
// کانا، و بند Exception وابسته به زبان ژاپنی (به‌علاوه نقطه‌های نگارشی CJK)
const CJK_RANGES: Array<[number, number]> = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Extension A
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x31f0, 0x31ff], // Katakana Phonetic Extensions
  [0xff66, 0xff9d], // Halfwidth Katakana
];

export function findCjkCharacters(text: string): string[] {
  const found: string[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) {
      found.push(ch);
    }
  }
  return found;
}

/**
 * تشخیص نویسه‌های چینی/ژاپنی ناخواسته در پاسخ دستیار.
 * اگر زبان هدف چینی یا ژاپنی نباشد، وجود هر نویسه CJK یک نقض سیاست زبانی است.
 */
export function detectUnexpectedCjk(text: string, targetLanguage: string): boolean {
  const lang = targetLanguage.toLowerCase();
  if (lang.startsWith("zh") || lang.startsWith("ja")) return false;
  return findCjkCharacters(text).length > 0;
}

/**
 * برآورد زبان پیام کاربر برای انتخاب سیاست پاسخ.
 */
export function detectLanguage(text: string): "fa" | "en" | "other" {
  const fa = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const en = (text.match(/[A-Za-z]/g) ?? []).length;
  if (fa === 0 && en === 0) return "other";
  if (fa >= en) return "fa";
  return "en";
}

/** حذف نویسه‌های کنترلی مشکوک و نرمال‌سازی ساده فاصله */
export function sanitizeOutput(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
}

/**
 * نگاشت خطاهای خام درگاه به پیام فارسی؛ هرگز نویسه چینی/ژاپنی را به کاربر نشان نده.
 */
export function mapUpstreamError(message: string, friendly = "درگاه هوش مصنوعی موقتاً در دسترس نیست؛ چند لحظه بعد دوباره تلاش کن."): string {
  if (!message) return friendly;
  if (findCjkCharacters(message).length > 0) return friendly;
  return message;
}

// --- ابزارهای نگارش فارسی ---

/** جایگزینی فاصله‌های ساده قبل از «؟»، «!»، «؛»، «،» و «:» با شکل درست */
export function normalizePersianPunctuation(text: string): string {
  return text
    .replace(/ +([؟!؛،:])/g, "$1")
    .replace(/([؟!؛،])(?=\S)/g, "$1 ");
}

/** تبدیل ارقام لاتین به فارسی (برای نمایش؛ در کد و فرمول استفاده نمی‌شود) */
export function toPersianDigits(text: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return text.replace(/[0-9]/g, (d) => fa[Number(d)]);
}
