// Xenon 1 AI — Bilingual i18n System (English + Persian)
// سیستم دوزبانه: دیکشنری تایپ‌امن، فروش زبان، ابزارهای قالب‌بندی اعداد/تاریخ
//
// - SSR: سرور زبان را از کوکی «xenon_locale» می‌خواند و روی <html lang dir> می‌نویسد.
// - کلاینت: فروش در لحظهٔ ساخت، زبان را از documentElement.lang (مقدار رندرشده سمت سرور)
//   می‌خواند تا ناسازگاری آب‌پراکنی (hydration mismatch) رخ ندهد.
// - setLocale: هم‌زمان localStorage («xenon-locale»)، کوکی («xenon_locale»)
//   و lang/dir سند را به‌روز می‌کند.

import { create } from "zustand";

export type Locale = "en" | "fa";

const LOCALE_STORAGE_KEY = "xenon-locale";
const LOCALE_COOKIE_KEY = "xenon_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // یک سال

export const LOCALE_COOKIE_NAME = LOCALE_COOKIE_KEY;

export const LOCALES: Array<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "fa", label: "فارسی" },
];

// ---------------------------------------------------------------- دیکشنری انگلیسی

const en = {
  // برند و پوسته
  "app.brand": "Xenon 1",
  "app.tagline": "Multimodal AI Platform",
  "app.sheetNavTitle": "Conversations",
  "app.sheetNavDescription": "Chats, folders and search",

  // دسترس‌پذیری عمومی
  "a11y.toggleTheme": "Toggle light and dark mode",
  "a11y.openConversations": "Open conversations list",
  "a11y.xenonIcon": "Xenon 1 icon",
  "a11y.xenonAvatar": "Xenon icon",
  "a11y.memory": "Persistent memory",
  "a11y.settings": "Conversation settings",
  "a11y.changeLanguage": "Change language",
  "a11y.aiProfile": "Choose AI profile",
  "a11y.conversationMenu": "Menu for conversation {title}",
  "a11y.folderMenu": "Menu for folder {name}",
  "a11y.scrollToBottom": "Scroll to bottom",
  "a11y.loading": "Loading",
  "a11y.loadingMessages": "Loading messages",
  "a11y.newFolder": "Create new folder",
  "a11y.searchConversations": "Search conversations",
  "a11y.messageInput": "Message text",
  "a11y.attachFile": "Attach file",
  "a11y.voiceInput": "Voice input",
  "a11y.stopRecording": "Stop voice recording",
  "a11y.imageGenToggle": "Image generator mode",
  "a11y.stopGeneration": "Stop response generation",
  "a11y.sendMessage": "Send message",
  "a11y.removeAttachment": "Remove attachment {name}",
  "a11y.yourMessage": "Your message",
  "a11n.xenonReply": "Xenon's reply",
  "a11y.copyReply": "Copy reply",
  "a11y.copied": "Copied",
  "a11y.regenerate": "Regenerate response",
  "a11y.stopSpeaking": "Stop audio playback",
  "a11n.readAloud": "Read reply aloud",
  "a11y.saveToMemory": "Save to memory",
  "a11y.typing": "Typing",
  "a11y.copyCode": "Copy code",
  "a11y.memoriesList": "Memories list",
  "a11y.memoryContent": "New memory content",
  "a11y.memoryCategory": "Memory category",
  "a11y.deleteMemory": "Delete this memory",
  "a11y.suggestion": "Suggestion: {prompt}",
  "a11y.welcome": "Welcome",
  "a11y.folderColor": "Folder color",
  "a11y.colorValue": "Color {color}",
  "a11y.conversationTitle": "New conversation title",
  "a11y.folderNameInput": "New folder name",
  "a11y.folderName": "Folder name",
  "a11y.aboutModel": "About the model",
  "a11y.toggleSidebar": "Toggle sidebar",
  "a11y.agentActivity": "Agent activity timeline",

  // کنش‌های مشترک
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.add": "Add",
  "common.delete": "Delete",

  // نوار کناری
  "sidebar.newChat": "New chat",
  "sidebar.searchPlaceholder": "Search conversations…",
  "sidebar.pinned": "Pinned",
  "sidebar.folders": "Folders",
  "sidebar.conversations": "Conversations",
  "sidebar.today": "Today",
  "sidebar.yesterday": "Yesterday",
  "sidebar.older": "Older",
  "sidebar.emptyTitle": "No conversations yet",
  "sidebar.emptyHint": "Tap “New chat” to get started",
  "sidebar.noResults": "No results for this search",
  "sidebar.newFolder": "New folder",
  "sidebar.foldersHint": "Group conversations into folders to stay organized",
  "sidebar.noUnfiled": "No unfiled conversations",
  "sidebar.emptyFolder": "No conversations in this folder",
  "sidebar.pin": "Pin",
  "sidebar.unpin": "Unpin",
  "sidebar.rename": "Rename",
  "sidebar.moveToFolder": "Move to folder",
  "sidebar.noFolders": "No folders yet",
  "sidebar.noFolder": "No folder",
  "sidebar.renameConversationTitle": "Rename conversation",
  "sidebar.renameConversationDesc": "Enter a new name for this conversation.",
  "sidebar.conversationTitlePlaceholder": "Conversation title",
  "sidebar.renameFolderTitle": "Rename folder",
  "sidebar.renameFolderDesc": "Enter a new name for this folder.",
  "sidebar.deleteFolder": "Delete folder",
  "sidebar.deleteConversationTitle": "Delete conversation",
  "sidebar.deleteConversationDesc": "Delete “{title}”? This action cannot be undone.",
  "sidebar.deleteFolderDesc": "Folder “{name}” will be removed. Conversations inside it are kept and become unfiled.",
  "sidebar.newFolderTitle": "New folder",
  "sidebar.newFolderDesc": "Create a folder to organize your conversations.",
  "sidebar.createFolder": "Create folder",
  "sidebar.toast.folderCreated": "Folder created",
  "sidebar.toast.folderCreateFailed": "Failed to create the folder",
  "sidebar.toast.renameFailed": "Rename failed",
  "sidebar.toast.folderRenameFailed": "Failed to rename the folder",
  "sidebar.userGuest": "Guest",
  "sidebar.userLocal": "Local workspace",

  // خوش‌آمدگویی
  "welcome.tagline": "A multimodal AI agent for reasoning, coding, research, and creativity",
  "welcome.disclaimer": "Xenon can make mistakes — verify important information.",

  // کارت‌های پیشنهاد
  "suggestion.reasoningLabel": "Reasoning",
  "suggestion.reasoningPrompt": "Explain step by step why the square root of 2 is irrational",
  "suggestion.codingLabel": "Coding",
  "suggestion.codingPrompt": "Write a React hook for debouncing rapid requests",
  "suggestion.researchLabel": "Research",
  "suggestion.researchPrompt": "Review the latest open-source LLMs with sources",
  "suggestion.imageLabel": "Image maker",
  "suggestion.imagePrompt": "Imagine and describe a colorful poster for an AI event in Tehran",

  // ناحیه گفتگو
  "chat.emptyConversation": "This conversation is empty — send the first message.",

  // نوشتار (Composer)
  "composer.placeholder": "Write your message…",
  "composer.imagePlaceholder": "Describe the image you want me to create…",
  "composer.imageGenBadge": "Image mode active",
  "composer.imageGenLabel": "Image",
  "composer.charCount": "{count} characters",
  "composer.hint": "Xenon can make mistakes. Enter to send, Shift+Enter for a new line",
  "composer.hintShort": "Enter to send · Shift+Enter for a new line",
  "composer.generating": "Generating response…",
  "composer.recording": "Recording… {timer} — tap the microphone again to finish",
  "composer.transcribing": "Transcribing speech…",
  "composer.toast.sendFailed": "Failed to send the message",
  "composer.toast.uploadFailed": "Uploading “{name}” failed",
  "composer.voice.unsupported": "Voice recording is not supported in this browser",
  "composer.voice.noAudio": "No audio was recorded",
  "composer.voice.readFailed": "Failed to read the audio file",
  "composer.voice.asrLimited": "Speech recognition is limited on the current gateway — please type instead",
  "composer.voice.noResult": "Speech recognition returned nothing usable — please type instead",
  "composer.voice.failed": "Speech recognition failed",
  "composer.voice.micDenied": "Microphone access was not granted",

  // پیام‌ها
  "message.reasoningChain": "Reasoning chain",
  "message.sources": "Sources",
  "message.servedBy": "Served by {model}",
  "message.langWarning": "Language consistency warning: unexpected characters were detected in this response.",
  "message.toast.copyFailed": "Copy failed",
  "message.toast.ttsFailed": "Speech synthesis failed",
  "message.toast.memoryAdded": "Added to memory",
  "message.toast.memoryFailed": "Failed to add to memory",
  "message.toast.regenerateFailed": "Failed to regenerate the response",

  // پنل حافظه
  "memory.title": "Persistent memory",
  "memory.description": "Information Xenon uses to personalize its answers. View, edit, or delete it anytime.",
  "memory.inputPlaceholder": "Tell me something new about yourself…",
  "memory.category.preference": "Preference",
  "memory.category.fact": "Fact",
  "memory.category.project": "Project",
  "memory.category.general": "General",
  "memory.empty": "Memory is empty. You can also use the “Save to memory” button under any reply.",
  "memory.privacy": "Memory is only filled with what you approve, and it stays stored on your device.",
  "memory.toast.added": "Added to memory",
  "memory.toast.addFailed": "Failed to add to memory",
  "memory.toast.deleteFailed": "Failed to delete the memory",

  // تنظیمات گفتگو
  "settings.title": "Conversation settings",
  "settings.descriptionActive": "Specific to conversation “{title}”",
  "settings.descriptionInactive": "Open a conversation first to enable its settings.",
  "settings.instructionLabel": "Custom system instruction for this conversation",
  "settings.instructionPlaceholder": "e.g. Keep a formal tone and write concise answers…",
  "settings.instructionHint": "This instruction only affects Xenon's behavior in this conversation.",
  "settings.aboutText":
    "Current profile: {profile} — all text requests are served by the GLM gateway as {textModel}; vision by {visionModel}. Profiles change behavior (reasoning, search, vision), not the model's identity.",
  "settings.toast.saved": "System instruction saved",
  "settings.toast.saveFailed": "Failed to save settings",

  // فعالیت عامل (Agent activity) — گام‌های برنامه‌ریزی/جست‌وجو/خواندن/تولید
  "agent.activity": "Agent activity",
  "agent.showActivity": "Show activity",
  "agent.hideActivity": "Hide activity",
  "agent.progress": "{done}/{total} steps",
  "agent.step.plan": "Planning",
  "agent.step.search": "Searching the web",
  "agent.step.read": "Reading",
  "agent.step.github": "GitHub cloud access",
  "agent.step.synthesize": "Synthesizing the answer",

  // نوار وضعیت
  "status.attribution": "Powered by GLM via the Z.ai API",
  "status.library": "Library: The Ninth Vein (PDF)",
  "status.stats": "{conversations} chats · {messages} messages · {memories} memories",
  "status.loading": "…",

  // پیام‌های فروش (store)
  "toast.conversationMissing": "This conversation no longer exists and was removed from the list.",
  "toast.conversationLoadFailed": "Failed to load the conversation.",
  "toast.stopped": "⏹ Response generation stopped.",
  "toast.networkError": "Server connection error",
  "toast.imageGenerated": "Image generated for “{prompt}”.",
  "store.generatedImageName": "Image-{index}",
} as const;

export type TranslationKey = keyof typeof en;

// ---------------------------------------------------------------- دیکشنری فارسی

// رشته‌های فارسی عمداً از نسخهٔ فعلی کپی شده‌اند (با اصلاح نیم‌فاصله‌های لازم)
const fa: Record<TranslationKey, string> = {
  "app.brand": "Xenon 1",
  "app.tagline": "پلتفرم هوش مصنوعی چندوجهی",
  "app.sheetNavTitle": "فهرست گفتگوها",
  "app.sheetNavDescription": "گفتگوها، پوشه‌ها و جست‌وجو",

  "a11y.toggleTheme": "تغییر حالت روشن و تاریک",
  "a11y.openConversations": "باز کردن فهرست گفتگوها",
  "a11y.xenonIcon": "آیکون زنون ۱",
  "a11y.xenonAvatar": "آیکون زنون",
  "a11y.memory": "حافظه پایدار",
  "a11y.settings": "تنظیمات گفتگو",
  "a11y.changeLanguage": "تغییر زبان",
  "a11y.aiProfile": "انتخاب پروفایل هوش مصنوعی",
  "a11y.conversationMenu": "منوی گفتگوی {title}",
  "a11y.folderMenu": "منوی پوشه {name}",
  "a11y.scrollToBottom": "رفتن به پایین",
  "a11y.loading": "در حال بارگذاری",
  "a11y.loadingMessages": "در حال بارگذاری پیام‌ها",
  "a11y.newFolder": "ساخت پوشه جدید",
  "a11y.searchConversations": "جستجو در گفتگوها",
  "a11y.messageInput": "متن پیام",
  "a11y.attachFile": "پیوست فایل",
  "a11y.voiceInput": "ورودی صوتی",
  "a11y.stopRecording": "پایان ضبط صدا",
  "a11y.imageGenToggle": "حالت تصویرساز",
  "a11y.stopGeneration": "توقف تولید پاسخ",
  "a11y.sendMessage": "ارسال پیام",
  "a11y.removeAttachment": "حذف پیوست {name}",
  "a11y.yourMessage": "پیام شما",
  "a11n.xenonReply": "پاسخ زنون",
  "a11y.copyReply": "کپی پاسخ",
  "a11y.copied": "کپی شد",
  "a11y.regenerate": "تولید دوباره پاسخ",
  "a11y.stopSpeaking": "توقف پخش صدا",
  "a11n.readAloud": "خواندن پاسخ با صدا",
  "a11y.saveToMemory": "ذخیره در حافظه",
  "a11y.typing": "در حال نوشتن",
  "a11y.copyCode": "کپی کد",
  "a11y.memoriesList": "فهرست حافظه‌ها",
  "a11y.memoryContent": "محتوای حافظه جدید",
  "a11y.memoryCategory": "دسته‌بندی حافظه",
  "a11y.deleteMemory": "حذف این حافظه",
  "a11y.suggestion": "پیشنهاد: {prompt}",
  "a11y.welcome": "خوش‌آمدگویی",
  "a11y.folderColor": "رنگ پوشه",
  "a11y.colorValue": "رنگ {color}",
  "a11y.conversationTitle": "عنوان تازه گفتگو",
  "a11y.folderNameInput": "نام تازه پوشه",
  "a11y.folderName": "نام پوشه",
  "a11y.aboutModel": "درباره مدل",
  "a11y.toggleSidebar": "باز و بسته کردن نوار کناری",
  "a11y.agentActivity": "خط زمانی فعالیت عامل",

  "common.cancel": "انصراف",
  "common.save": "ذخیره",
  "common.close": "بستن",
  "common.add": "افزودن",
  "common.delete": "حذف",

  "sidebar.newChat": "گفتگوی جدید",
  "sidebar.searchPlaceholder": "جستجو در گفتگوها…",
  "sidebar.pinned": "پین‌شده",
  "sidebar.folders": "پوشه‌ها",
  "sidebar.conversations": "گفتگوها",
  "sidebar.today": "امروز",
  "sidebar.yesterday": "دیروز",
  "sidebar.older": "قدیمی‌تر",
  "sidebar.emptyTitle": "هنوز گفتگویی ندارید",
  "sidebar.emptyHint": "برای شروع، «گفتگوی جدید» را بزنید",
  "sidebar.noResults": "نتیجه‌ای برای این جست‌وجو یافت نشد",
  "sidebar.newFolder": "پوشه جدید",
  "sidebar.foldersHint": "برای نظم بیشتر، گفتگوها را دسته‌بندی کنید",
  "sidebar.noUnfiled": "گفتگویی بدون پوشه وجود ندارد",
  "sidebar.emptyFolder": "گفتگویی در این پوشه نیست",
  "sidebar.pin": "پین کردن",
  "sidebar.unpin": "برداشتن پین",
  "sidebar.rename": "تغییر نام",
  "sidebar.moveToFolder": "انتقال به پوشه",
  "sidebar.noFolders": "پوشه‌ای وجود ندارد",
  "sidebar.noFolder": "بدون پوشه",
  "sidebar.renameConversationTitle": "تغییر نام گفتگو",
  "sidebar.renameConversationDesc": "نام تازه‌ای برای این گفتگو وارد کنید.",
  "sidebar.conversationTitlePlaceholder": "عنوان گفتگو",
  "sidebar.renameFolderTitle": "تغییر نام پوشه",
  "sidebar.renameFolderDesc": "نام تازه‌ای برای این پوشه وارد کنید.",
  "sidebar.deleteFolder": "حذف پوشه",
  "sidebar.deleteConversationTitle": "حذف گفتگو",
  "sidebar.deleteConversationDesc": "آیا از حذف «{title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.",
  "sidebar.deleteFolderDesc": "پوشه «{name}» حذف می‌شود. گفتگوهای داخل آن حذف نمی‌شوند و بدون پوشه باقی می‌مانند.",
  "sidebar.newFolderTitle": "پوشه جدید",
  "sidebar.newFolderDesc": "برای دسته‌بندی گفتگوها یک پوشه بسازید.",
  "sidebar.createFolder": "ساخت پوشه",
  "sidebar.toast.folderCreated": "پوشه ساخته شد",
  "sidebar.toast.folderCreateFailed": "ساخت پوشه ناموفق بود",
  "sidebar.toast.renameFailed": "تغییر نام ناموفق بود",
  "sidebar.toast.folderRenameFailed": "تغییر نام پوشه ناموفق بود",
  "sidebar.userGuest": "مهمان",
  "sidebar.userLocal": "فضای کاری محلی",

  "welcome.tagline": "دستیار هوشمند چندوجهی برای استدلال، کدنویسی، پژوهش و خلاقیت",
  "welcome.disclaimer": "زنون می‌تواند خطا کند؛ اطلاعات مهم را بررسی کنید.",

  "suggestion.reasoningLabel": "استدلال",
  "suggestion.reasoningPrompt": "اثبات اینکه ریشه ۲ عدد گنگ است را گام‌به‌گام توضیح بده",
  "suggestion.codingLabel": "برنامه‌نویسی",
  "suggestion.codingPrompt": "یک هوک React برای جلوگیری از درخواست‌های تکراری (debounce) بنویس",
  "suggestion.researchLabel": "پژوهش",
  "suggestion.researchPrompt": "جدیدترین مدل‌های زبانی متن‌باز را با منابع بررسی کن",
  "suggestion.imageLabel": "تصویرساز",
  "suggestion.imagePrompt": "پوستری رنگارنگ برای رویداد هوش مصنوعی در تهران تصور و توصیف کن",

  "chat.emptyConversation": "این گفتگو خالی است؛ اولین پیام را بنویسید.",

  "composer.placeholder": "پیام خود را بنویسید…",
  "composer.imagePlaceholder": "تصویری که می‌خواهی بسازم را توصیف کن…",
  "composer.imageGenBadge": "حالت تصویرساز فعال",
  "composer.imageGenLabel": "تصویرساز",
  "composer.charCount": "{count} نویسه",
  "composer.hint": "زنون می‌تواند خطا کند. Enter برای ارسال، Shift+Enter برای سطر جدید",
  "composer.hintShort": "Enter برای ارسال · Shift+Enter برای سطر جدید",
  "composer.generating": "در حال تولید پاسخ…",
  "composer.recording": "در حال ضبط… {timer} — برای پایان، دکمهٔ میکروفون را دوباره بزنید",
  "composer.transcribing": "در حال تبدیل گفتار به نوشتار…",
  "composer.toast.sendFailed": "ارسال پیام ناموفق بود",
  "composer.toast.uploadFailed": "آپلود «{name}» ناموفق بود",
  "composer.voice.unsupported": "ضبط صدا در این مرورگر پشتیبانی نمی‌شود",
  "composer.voice.noAudio": "صدایی ضبط نشد",
  "composer.voice.readFailed": "خواندن فایل صوتی ناموفق بود",
  "composer.voice.asrLimited": "تشخیص گفتار در درگاه فعلی محدود است — لطفاً تایپ کنید",
  "composer.voice.noResult": "تشخیص گفتار نتیجهٔ قابل استفاده‌ای نداشت — لطفاً تایپ کنید",
  "composer.voice.failed": "تشخیص گفتار ناموفق بود",
  "composer.voice.micDenied": "دسترسی به میکروفون ممکن نشد",

  "message.reasoningChain": "زنجیره استدلال",
  "message.sources": "منابع",
  "message.servedBy": "سرو‌شده با {model}",
  "message.langWarning": "هشدار سازگاری زبانی: نویسه‌های غیرمنتظره در پاسخ شناسایی شد.",
  "message.toast.copyFailed": "کپی ناموفق بود",
  "message.toast.ttsFailed": "تولید گفتار ناموفق بود",
  "message.toast.memoryAdded": "به حافظه اضافه شد",
  "message.toast.memoryFailed": "افزودن به حافظه ناموفق بود",
  "message.toast.regenerateFailed": "بازتولید پاسخ ناموفق بود",

  "memory.title": "حافظه پایدار",
  "memory.description": "اطلاعاتی که زنون برای پاسخ‌های شخصی‌تر به‌کار می‌گیرد. هر زمان بخواهید می‌توانید ببینید، ویرایش یا حذف کنید.",
  "memory.inputPlaceholder": "چیز تازه‌ای درباره خودتان بگویید…",
  "memory.category.preference": "ترجیح",
  "memory.category.fact": "دانش",
  "memory.category.project": "پروژه",
  "memory.category.general": "عمومی",
  "memory.empty": "حافظه خالی است. از دکمهٔ «ذخیره در حافظه» زیر پیام‌ها هم می‌توانید استفاده کنید.",
  "memory.privacy": "حافظه فقط با تأیید شما پر می‌شود و روی دستگاه شما ذخیره می‌ماند.",
  "memory.toast.added": "به حافظه اضافه شد",
  "memory.toast.addFailed": "افزودن به حافظه ناموفق بود",
  "memory.toast.deleteFailed": "حذف حافظه ناموفق بود",

  "settings.title": "تنظیمات گفتگو",
  "settings.descriptionActive": "مخصوص گفتگوی «{title}»",
  "settings.descriptionInactive": "برای فعال شدن تنظیمات گفتگو، ابتدا یک گفتگو باز کنید.",
  "settings.instructionLabel": "دستور سیستمی سفارشی این گفتگو",
  "settings.instructionPlaceholder": "مثلاً: لحن رسمی داشته باش و پاسخ‌ها را کوتاه بنویس…",
  "settings.instructionHint": "این دستور فقط بر رفتار زنون در همین گفتگو اثر می‌گذارد.",
  "settings.aboutText":
    "پروفایل فعلی: {profile} — تمام درخواست‌های متنی توسط درگاه GLM با شناسهٔ served {textModel} پردازش می‌شود؛ بینایی با {visionModel}. پروفایل‌ها رفتار (استدلال، جست‌وجو، بینایی) را تغییر می‌دهند، نه هویت مدل را.",
  "settings.toast.saved": "دستور سیستمی ذخیره شد",
  "settings.toast.saveFailed": "ذخیره تنظیمات ناموفق بود",

  // فعالیت عامل (Agent activity)
  "agent.activity": "فعالیت عامل",
  "agent.showActivity": "نمایش فعالیت",
  "agent.hideActivity": "پنهان کردن فعالیت",
  "agent.progress": "{done}/{total} گام",
  "agent.step.plan": "برنامه‌ریزی",
  "agent.step.search": "جست‌وجوی وب",
  "agent.step.read": "خواندن صفحه",
  "agent.step.github": "دسترسی ابری گیت‌هاب",
  "agent.step.synthesize": "تولید پاسخ",

  "status.attribution": "قدرت‌گرفته از GLM از طریق API زی‌ای‌آی",
  "status.library": "کتابخانه: نهمین رگ (PDF)",
  "status.stats": "{conversations} گفتگو · {messages} پیام · {memories} حافظه",
  "status.loading": "…",

  "toast.conversationMissing": "این گفتگو دیگر موجود نیست و از فهرست حذف شد.",
  "toast.conversationLoadFailed": "بارگذاری گفتگو ناموفق بود.",
  "toast.stopped": "⏹ تولید پاسخ متوقف شد.",
  "toast.networkError": "خطای ارتباط با سرور",
  "toast.imageGenerated": "تصویر برای درخواست «{prompt}» تولید شد.",
  "store.generatedImageName": "تصویر-{index}",
};

export const dict: Record<Locale, Record<TranslationKey, string>> = { en, fa };

// ---------------------------------------------------------------- موتور ترجمه

export type TranslationVars = Record<string, string | number>;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

export function translate(locale: Locale, key: TranslationKey, vars?: TranslationVars): string {
  return interpolate(dict[locale][key] ?? key, vars);
}

export function makeTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

/** ترجمهٔ دستوری (خارج از React) با زبان فعلی فروش — برای storeها و ماژول‌های غیرکامپوننتی */
export function translateNow(key: TranslationKey, vars?: TranslationVars): string {
  return translate(useI18n.getState().locale, key, vars);
}

// ---------------------------------------------------------------- اعمال و ذخیره زبان

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "fa" ? "rtl" : "ltr";
}

function applyToDocument(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = dirOf(locale);
}

function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // حافظه محلی در دسترس نیست — کوکی کافی است
  }
  document.cookie = `${LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/** زبان اولیه: از مقدار رندرشدهٔ سمت سرور روی <html lang> خوانده می‌شود تا با SSR یکسان بماند */
function initialLocale(): Locale {
  if (typeof document === "undefined") return "en";
  return document.documentElement.lang === "fa" ? "fa" : "en";
}

interface I18nState {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: initialLocale(),
  t: (key, vars) => translate(get().locale, key, vars),
  setLocale: (locale) => {
    applyToDocument(locale);
    persistLocale(locale);
    set({ locale });
  },
}));

/** مترجم واکنش‌گرا و زبان فعلی برای کامپوننت‌ها در locale-provider.tsx ارائه می‌شود
 * (useT و useLocale به‌دلیل کانتکست React باید داخل مرز "use client" تعریف شوند). */

// ---------------------------------------------------------------- قالب‌بندی اعداد و تاریخ

/** عدد با ارقام محلی: fa-IR برای فارسی، لاتین برای انگلیسی */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
}

/** زمان‌سنج ضبط mm:ss با ارقام محلی */
export function formatTimer(totalSeconds: number, locale: Locale): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mm = formatNumber(m, locale);
  const ss = formatNumber(s, locale).padStart(2, locale === "fa" ? "۰" : "0");
  return `${mm}:${ss}`;
}

/** تاریخ میلادی خوانا با ارقام محلی */
export function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
