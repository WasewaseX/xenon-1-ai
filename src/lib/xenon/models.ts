// Xenon 1 AI — Model & Routing Registry
// فهرست پروفایل‌های مسیریابی مدل — شفاف و بدون هویت ساختگی
//
// نکته مهندسی: درگاه استنتاج این محیط، تمام درخواست‌های متنی را با مدل GLM
// (که در پاسخ با شناسه glm-4-plus اعلام می‌شود) سرو می‌کند و درخواست‌های
// بینایی را با glm-4.6v. بنابراین به‌جای نمایش شناسه‌های مدلِ بی‌اثر،
// «پروفایل مسیریابی» ارائه می‌کنیم که رفتار واقعی (استدلال، جست‌وجو،
// بینایی) را تغییر می‌دهد و مدل واقعیِ سروکننده در هر پاسخ شفاف نمایش داده می‌شود.

import type { Locale } from "./i18n";
import type { ChatMode, RoutingProfile } from "./types";

export const VISION_MODEL = "glm-4.6v";
export const SERVED_TEXT_MODEL = "glm-4-plus"; // شناسه اعلام‌شده از درگاه GLM

// پروفایل با برچسب دوزبانه: fa در label/description، en در labelEn/descriptionEn
export interface LocalizedRoutingProfile extends RoutingProfile {
  labelEn: string;
  descriptionEn: string;
}

export const ROUTING_PROFILES: LocalizedRoutingProfile[] = [
  {
    id: "general",
    label: "زنون هسته",
    description: "گفتگوی عمومی، سریع و روان برای کارهای روزمره",
    labelEn: "Xenon Core",
    descriptionEn: "Fast, smooth everyday conversation",
    icon: "Sparkles",
    thinking: false,
    webSearch: false,
  },
  {
    id: "reasoning",
    label: "زنون استدلال",
    description: "زنجیره استدلال عمیق برای مسائل ریاضی و منطقی",
    labelEn: "Xenon Reasoning",
    descriptionEn: "Deep reasoning chains for math and logic problems",
    icon: "Brain",
    thinking: true,
    webSearch: false,
  },
  {
    id: "coding",
    label: "زنون برنامه‌نویس",
    description: "تولید، اشکال‌زدایی و بازآرایی کد با تمرکز مهندسی",
    labelEn: "Xenon Coder",
    descriptionEn: "Generate, debug and refactor code with engineering focus",
    icon: "Code2",
    thinking: false,
    webSearch: false,
  },
  {
    id: "research",
    label: "زنون پژوهشگر",
    description: "جست‌وجوی وب، استخراج شواهد و پاسخ همراه با ارجاع",
    labelEn: "Xenon Research",
    descriptionEn: "Web search, evidence extraction and cited answers",
    icon: "Telescope",
    thinking: false,
    webSearch: true,
  },
  {
    id: "agent",
    label: "زنون ایجنت",
    description: "جست‌وجوی وب چندمرحله‌ای، خواندن صفحه‌ها و پاسخ مستند — عامل خودکار",
    descriptionEn: "Multi-step web research: searches, reads pages, cites sources — autonomous agent",
    labelEn: "Xenon Agent",
    icon: "Bot",
    thinking: false,
    webSearch: true,
  },
];

export function getProfile(mode: ChatMode): LocalizedRoutingProfile {
  return ROUTING_PROFILES.find((p) => p.id === mode) ?? ROUTING_PROFILES[0];
}

// برچسب/توضیح محلی‌شده بر اساس زبان رابط کاربری
export function profileLabel(profile: LocalizedRoutingProfile, locale: Locale): string {
  return locale === "en" ? profile.labelEn : profile.label;
}

export function profileDescription(profile: LocalizedRoutingProfile, locale: Locale): string {
  return locale === "en" ? profile.descriptionEn : profile.description;
}

export const MAX_CONTEXT_MESSAGES = 24; // بودجه زمینه: تعداد پیام‌های ارسالی به مدل
export const MAX_ATTACHMENT_TEXT = 12_000; // سقف نویسه برای فایل‌های متنی پیوست

// --- بودجه حلقه عامل (حالت ایجنت) ---
export const AGENT_MAX_SEARCHES = 3; // حداکثر جست‌وجوی وب در یک نوبت
export const AGENT_MAX_READS = 3; // حداکثر صفحه‌ی خوانده‌شده در یک نوبت
export const AGENT_MAX_SOURCES = 12; // سقف کل منابع ادغام‌شده
export const AGENT_TIME_BUDGET_MS = 240_000; // بودجه زمانی کل حلقه عامل
export const AGENT_PAGE_TEXT_LIMIT = 3_000; // سقف نویسه استخراج هر صفحه
