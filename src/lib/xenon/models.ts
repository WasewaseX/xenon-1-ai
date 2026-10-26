// Xenon 1 AI — Model & Routing Registry
// فهرست پروفایل‌های مسیریابی مدل — شفاف و بدون هویت ساختگی
//
// نکته مهندسی: درگاه استنتاج این محیط، تمام درخواست‌های متنی را با مدل GLM
// (که در پاسخ با شناسه glm-4-plus اعلام می‌شود) سرو می‌کند و درخواست‌های
// بینایی را با glm-4.6v. بنابراین به‌جای نمایش شناسه‌های مدلِ بی‌اثر،
// «پروفایل مسیریابی» ارائه می‌کنیم که رفتار واقعی (استدلال، جست‌وجو،
// بینایی) را تغییر می‌دهد و مدل واقعیِ سروکننده در هر پاسخ شفاف نمایش داده می‌شود.

import type { ChatMode, RoutingProfile } from "./types";

export const VISION_MODEL = "glm-4.6v";
export const SERVED_TEXT_MODEL = "glm-4-plus"; // شناسه اعلام‌شده از درگاه GLM

export const ROUTING_PROFILES: RoutingProfile[] = [
  {
    id: "general",
    label: "زنون هسته",
    description: "گفتگوی عمومی، سریع و روان برای کارهای روزمره",
    icon: "Sparkles",
    thinking: false,
    webSearch: false,
  },
  {
    id: "reasoning",
    label: "زنون استدلال",
    description: "زنجیره استدلال عمیق برای مسائل ریاضی و منطقی",
    icon: "Brain",
    thinking: true,
    webSearch: false,
  },
  {
    id: "coding",
    label: "زنون برنامه‌نویس",
    description: "تولید، اشکال‌زدایی و بازآرایی کد با تمرکز مهندسی",
    icon: "Code2",
    thinking: false,
    webSearch: false,
  },
  {
    id: "research",
    label: "زنون پژوهشگر",
    description: "جست‌وجوی وب، استخراج شواهد و پاسخ همراه با ارجاع",
    icon: "Telescope",
    thinking: false,
    webSearch: true,
  },
];

export function getProfile(mode: ChatMode): RoutingProfile {
  return ROUTING_PROFILES.find((p) => p.id === mode) ?? ROUTING_PROFILES[0];
}

export const MAX_CONTEXT_MESSAGES = 24; // بودجه زمینه: تعداد پیام‌های ارسالی به مدل
export const MAX_ATTACHMENT_TEXT = 12_000; // سقف نویسه برای فایل‌های متنی پیوست
