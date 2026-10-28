// Xenon 1 AI — Client State (Zustand)
// مدیریت وضعیت کلاینت: گفتگوها، پیام‌ها، جریان زنده، حافظه

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";
import * as api from "./api";
import { StreamInterruptedError, StreamStartError } from "./api";
import { translateNow } from "./i18n";
import type { AgentStep, MessageWithSteps, XenonStepEvent } from "./steps";
import type {
  AttachmentMeta,
  ChatMode,
  ConversationDTO,
  FolderDTO,
  MemoryDTO,
  MessageDTO,
  StatsDTO,
  StreamEvent,
} from "./types";

interface XenonState {
  // داده‌ها
  conversations: ConversationDTO[];
  folders: FolderDTO[];
  memories: MemoryDTO[];
  messages: MessageDTO[];
  stats: StatsDTO | null;

  // وضعیت
  activeId: string | null;
  activeMode: ChatMode;
  loadingMessages: boolean;
  loadingSidebar: boolean;
  streaming: boolean;
  sending: boolean;
  searchQuery: string;
  attachments: AttachmentMeta[];
  imageGenMode: boolean;
  speakingId: string | null;

  /** آخرین ارسال ناموفق — برای دکمهٔ «تلاش دوباره» بدون از دست رفتن پیام */
  lastFailed: {
    content: string;
    mode: ChatMode;
    regenerate: boolean;
    userId: string;
    assistantId: string;
  } | null;

  // اکشن‌ها
  bootstrap: () => Promise<void>;
  refreshSidebar: () => Promise<void>;
  refreshStats: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  newChat: () => void;
  setMode: (mode: ChatMode) => void;
  setSearchQuery: (q: string) => void;

  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  regenerate: () => Promise<void>;
  retryLast: () => Promise<void>;
  clearLastFailed: () => void;
  editAndResend?: never; // رزرو

  addAttachment: (a: AttachmentMeta) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  toggleImageGen: (on?: boolean) => void;

  // گفتگو/پوشه
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  assignToFolder: (id: string, folderId: string | null) => Promise<void>;
  createFolder: (name: string, color?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  // حافظه
  addMemory: (content: string, category?: string) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;

  // صدا
  speakMessage: (message: MessageDTO) => Promise<void>;
  stopSpeaking: () => void;
}

let abortController: AbortController | null = null;
let currentAudio: HTMLAudioElement | null = null;

// بازیابی خودکار از محدودیت نرخ (۴۲۹ درگاه): حداکثر دو تلاش خودکار پشت‌سرهم با فاصلهٔ ۲۰ ثانیه.
// تلاش دستی کاربر (کلیک روی Retry یا ارسال تازه) شمارنده را صفر می‌کند تا بن‌بست احساس نشود.
let rateLimitRetryTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveRateLimitAutoRetries = 0;
const RATE_LIMIT_AUTO_RETRY_MS = 20_000;
const MAX_RATE_LIMIT_AUTO_RETRIES = 2;

function isRateLimitText(s: string): boolean {
  return /\b429\b|too many requests|rate.?limit/i.test(s);
}

function cancelRateLimitRetry() {
  if (rateLimitRetryTimer) {
    clearTimeout(rateLimitRetryTimer);
    rateLimitRetryTimer = null;
  }
}

/** ادغام رخدادهای "step" عامل در نقشهٔ گام‌های زنده (id → step) */
function mergeStepEvent(stepMap: Map<string, AgentStep>, event: XenonStepEvent): AgentStep[] {
  const existing = stepMap.get(event.id);
  if (event.state === "done") {
    if (existing) {
      existing.state = "done";
      if (event.summary) existing.summary = event.summary;
    } else {
      stepMap.set(event.id, {
        id: event.id,
        kind: event.kind,
        title: event.title,
        state: "done",
        summary: event.summary,
      });
    }
  } else if (!existing) {
    stepMap.set(event.id, { id: event.id, kind: event.kind, title: event.title, state: "start" });
  }
  return [...stepMap.values()];
}

/** پایان جریان: گام‌های بی‌پاسخ (بدون رویداد done) بسته می‌شوند تا اسپینر بی‌پایان نماند */
function finalizeSteps(stepMap: Map<string, AgentStep>): AgentStep[] | null {
  if (stepMap.size === 0) return null;
  for (const step of stepMap.values()) {
    if (step.state === "start") step.state = "done";
  }
  return [...stepMap.values()];
}

/** دسته‌بندی خطای جریان — هرگز متن خام مرورگر (NetworkError و امثال آن) به کاربر نشان داده نمی‌شود */
function classifyStreamFailure(err: unknown): "aborted" | "interrupted" | "start" | "generic" {
  if (err instanceof DOMException && err.name === "AbortError") return "aborted";
  if (err instanceof StreamInterruptedError) return "interrupted";
  if (err instanceof StreamStartError) return "start";
  return "generic";
}

export const useXenon = create<XenonState>((set, get) => ({
  conversations: [],
  folders: [],
  memories: [],
  messages: [],
  stats: null,

  activeId: null,
  activeMode: "general",
  loadingMessages: false,
  loadingSidebar: false,
  streaming: false,
  sending: false,
  searchQuery: "",
  attachments: [],
  imageGenMode: false,
  speakingId: null,
  lastFailed: null,

  bootstrap: async () => {
    set({ loadingSidebar: true });
    try {
      const [conversations, folders, memories] = await Promise.all([
        api.fetchConversations(),
        api.fetchFolders(),
        api.fetchMemories(),
      ]);
      set({ conversations, folders, memories });
      get().refreshStats();
    } finally {
      set({ loadingSidebar: false });
    }
  },

  refreshSidebar: async () => {
    const conversations = await api.fetchConversations();
    set({ conversations });
  },

  refreshStats: async () => {
    try {
      const stats = await api.fetchStats();
      set({ stats });
    } catch {
      // آمار حیاتی نیست
    }
  },

  openConversation: async (id) => {
    if (get().streaming) get().stopStreaming();
    set({ activeId: id, loadingMessages: true, messages: [] });
    try {
      const { conversation, messages } = await api.fetchConversation(id);
      set({
        messages,
        activeMode: conversation.mode,
        activeId: id,
        loadingMessages: false,
      });
    } catch (err) {
      // تاب‌آوری: گفتگوی حذف‌شده/منقضی هرگز نباید صفحهٔ مردهٔ خالی بسازد.
      const reason = err instanceof Error ? err.message : "";
      const looksMissing = /404|not ?found|یافت نشد|پیدا نشد|no longer exists/i.test(reason);
      if (looksMissing) {
        // گفتگو دیگر وجود ندارد: از فهرست حذف و به صفحهٔ خوش‌آمد برگرد
        toast({ title: translateNow("toast.conversationMissing"), variant: "destructive" });
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: null,
          messages: [],
          loadingMessages: false,
        }));
      } else {
        toast({ title: translateNow("toast.conversationLoadFailed"), variant: "destructive" });
        set({ activeId: null, messages: [], loadingMessages: false });
      }
    }
  },

  newChat: () => {
    if (get().streaming) get().stopStreaming();
    set({ activeId: null, messages: [], attachments: [], imageGenMode: false });
  },

  setMode: (mode) => {
    const id = get().activeId;
    set({ activeMode: mode });
    if (id) api.patchConversation(id, { mode }).catch(() => undefined);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  sendMessage: async (content) => {
    const state = get();
    if (state.sending || state.streaming) return;
    const text = content.trim();
    if (!text && state.attachments.length === 0) return;

    const isImageGen = state.imageGenMode;
    const tempUserId = `tmp-u-${Date.now()}`;
    const tempAssistantId = `tmp-a-${Date.now()}`;

    // کاربر چیزی تازه فرستاد → هر تلاش خودکار معلقِ محدودیت نرخ لغو می‌شود
    cancelRateLimitRetry();

    // نمایش خوش‌بینانه پیام کاربر + جای‌گیر دستیار
    const userMessage: MessageDTO = {
      id: tempUserId,
      conversationId: state.activeId ?? "",
      role: "user",
      content: text,
      attachments: state.attachments.length ? [...state.attachments] : null,
      createdAt: new Date().toISOString(),
    };
    const assistantPlaceholder: MessageDTO = {
      id: tempAssistantId,
      conversationId: state.activeId ?? "",
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };

    const attachments = state.attachments;
    const mode = state.activeMode;
    const sentConversationId = state.activeId; // شناسهٔ گفتگو در لحظهٔ ارسال
    let serverConversationId: string | null = null;

    set({
      sending: true,
      streaming: true,
      messages: [...state.messages, userMessage, assistantPlaceholder],
      attachments: [],
    });

    abortController = new AbortController();
    let assistantContent = "";
    let thinkingContent = "";
    let sources: MessageDTO["sources"] = null;
    let conversationCreated = false;
    const stepMap = new Map<string, AgentStep>();

    const updateAssistant = (patch: Partial<MessageWithSteps>) => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === tempAssistantId ? { ...m, ...patch } : m)),
      }));
    };

    try {
      if (isImageGen) {
        // حالت تصویرساز: تولید تصویر و نمایش به‌صورت پیام دستیار
        const { images } = await api.generateImages(text);
        const atts: AttachmentMeta[] = images.map((img, i) => ({
          id: `gen-${Date.now()}-${i}`,
          name: `${translateNow("store.generatedImageName", { index: i + 1 })}.${img.mime === "image/jpeg" ? "jpg" : "png"}`,
          type: img.mime,
          size: Math.round((img.base64.length * 3) / 4),
          url: `data:${img.mime};base64,${img.base64}`,
          kind: "image",
        }));
        const note = translateNow("toast.imageGenerated", { prompt: text });
        updateAssistant({ content: note, attachments: atts, streaming: false });
      } else {
        await api.streamChat(
          {
            conversationId: state.activeId,
            mode,
            content: text,
            attachments,
          },
          {
            signal: abortController.signal,
            onEvent: (streamEvent) => {
              // رخداد "step" عامل هنوز به قرارداد types.ts اضافه نشده — از نوع ساختاری widen می‌شود
              const event = streamEvent as StreamEvent | XenonStepEvent;
              switch (event.type) {
                case "meta":
                  serverConversationId = event.conversationId;
                  if (!conversationCreated && event.conversationId !== sentConversationId) {
                    conversationCreated = true;
                    // گفتگوی تازه ساخته شد (یا سرور شناسهٔ کهنه را خوددرمان کرد) —
                    // شناسهٔ تازه را بپذیر و فهرست را تازه‌سازی کن
                    set((s) => ({
                      activeId: event.conversationId,
                    }));
                    get().refreshSidebar();
                  }
                  break;
                case "step":
                  updateAssistant({ steps: mergeStepEvent(stepMap, event) });
                  break;
                case "delta":
                  assistantContent += event.text;
                  updateAssistant({ content: assistantContent });
                  break;
                case "thinking":
                  thinkingContent += event.text;
                  updateAssistant({ thinking: thinkingContent });
                  break;
                case "sources":
                  sources = event.sources;
                  updateAssistant({ sources });
                  break;
                case "title":
                  set((s) => ({
                    conversations: s.conversations.map((c) =>
                      c.id === get().activeId ? { ...c, title: event.title } : c
                    ),
                  }));
                  break;
                case "langWarning":
                  updateAssistant({ langWarning: true });
                  break;
                case "done": {
                  const finalSteps = finalizeSteps(stepMap);
                  if (finalSteps) updateAssistant({ steps: finalSteps });
                  updateAssistant({
                    streaming: false,
                    id: event.messageId !== tempAssistantId ? event.messageId : tempAssistantId,
                    servedModel: event.servedModel,
                    langWarning: event.langWarning,
                  });
                  // پاسخ کامل رسید → شمارندهٔ تلاش خودکار ۴۲۹ صفر می‌شود
                  consecutiveRateLimitAutoRetries = 0;
                  break;
                }
                case "error": {
                  // پیام خطای سرور خام (فارسی/بالادست) نمایش داده نمی‌شود — متن دوستانهٔ دوزبانه.
                  // console.warn (نه error) تا اورلی dev در Next.js آن را به‌عنوان کرش نشان ندهد —
                  // خطای سرور روال عادی کار با درگاه است و خودش retry/بازیابی دارد.
                  console.warn("[xenon] server error event:", event.message);
                  const rateLimited = !assistantContent && isRateLimitText(event.message);
                  if (rateLimited && consecutiveRateLimitAutoRetries < MAX_RATE_LIMIT_AUTO_RETRIES) {
                    // محدودیت نرخ: پیام کاربر حفظ می‌شود و پس از ۲۰ ثانیه خودکار دوباره ارسال می‌شود
                    consecutiveRateLimitAutoRetries += 1;
                    set({
                      lastFailed: {
                        content: text,
                        mode,
                        regenerate: false,
                        userId: tempUserId,
                        assistantId: tempAssistantId,
                      },
                    });
                    cancelRateLimitRetry();
                    rateLimitRetryTimer = setTimeout(() => {
                      rateLimitRetryTimer = null;
                      void get().retryLast();
                    }, RATE_LIMIT_AUTO_RETRY_MS);
                    updateAssistant({
                      streaming: false,
                      content: `⏳ ${translateNow("toast.rateLimitRetrying")}`,
                    });
                  } else {
                    updateAssistant({
                      streaming: false,
                      content: assistantContent ||
                        `⚠️ ${translateNow(rateLimited ? "toast.rateLimit" : "toast.requestFailed")}`,
                    });
                  }
                  break;
                }
              }
            },
          }
        );
      }
    } catch (err) {
      console.warn("[xenon] sendMessage stream failure:", err);
      const kind = classifyStreamFailure(err);
      const errText = err instanceof Error ? err.message : String(err ?? "");
      const rateLimited = !assistantContent && isRateLimitText(errText);
      if (kind === "aborted") {
        updateAssistant({
          streaming: false,
          content: assistantContent || translateNow("toast.stopped"),
        });
      } else if (assistantContent) {
        // پاسخ نیمه‌تمام حفظ می‌شود و نشان «قطع‌شدگی» روی همان پیام می‌نشیند
        updateAssistant({ streaming: false, interrupted: true });
        toast({ title: translateNow("toast.streamInterrupted"), variant: "destructive" });
      } else if (rateLimited && consecutiveRateLimitAutoRetries < MAX_RATE_LIMIT_AUTO_RETRIES) {
        // ۴۲۹ هنگام اتصال: تلاش خودکار پس از ۲۰ ثانیه
        consecutiveRateLimitAutoRetries += 1;
        set({
          lastFailed: {
            content: text,
            mode,
            regenerate: false,
            userId: tempUserId,
            assistantId: tempAssistantId,
          },
        });
        cancelRateLimitRetry();
        rateLimitRetryTimer = setTimeout(() => {
          rateLimitRetryTimer = null;
          void get().retryLast();
        }, RATE_LIMIT_AUTO_RETRY_MS);
        updateAssistant({
          streaming: false,
          content: `⏳ ${translateNow("toast.rateLimitRetrying")}`,
        });
      } else if (rateLimited) {
        // سقف تلاش خودکار پر شده: پیام دوستانهٔ محدودیت نرخ + چیپ Retry (پیام حفظ شده)
        set({
          lastFailed: {
            content: text,
            mode,
            regenerate: false,
            userId: tempUserId,
            assistantId: tempAssistantId,
          },
        });
        updateAssistant({
          streaming: false,
          content: `⚠️ ${translateNow("toast.rateLimit")}`,
        });
      } else {
        // هیچ متنی نرسید: پیام دوستانه + ثبت ارسال برای «تلاش دوباره» بدون از دست رفتن متن
        set({
          lastFailed: {
            content: text,
            mode,
            regenerate: false,
            userId: tempUserId,
            assistantId: tempAssistantId,
          },
        });
        updateAssistant({
          streaming: false,
          content: `⚠️ ${translateNow("toast.connectionLost")}`,
        });
        toast({
          title: translateNow("toast.connectionLost"),
          description: translateNow("toast.retryHint"),
          variant: "destructive",
        });
      }
    } finally {
      set({ sending: false, streaming: false });
      abortController = null;
      get().refreshSidebar();
      get().refreshStats();
      // همگام‌سازی پیام‌ها با سرور برای اطمینان از شناسه‌های واقعی:
      // ۱) گفتگوی تازه  ۲) سرور شناسهٔ متفاوتی برگردانده (خوددرمانی گفتگوی کهنه)
      // استثنا: اگر همین ارسال شکست خورد (lastFailed ثبت شد)، همگام‌سازی حباب خطا/⏳ را
      // با نمای سرور (که هنوز پیام دستیار ندارد) جایگزین نمی‌کند — حباب باید بماند.
      const failedThisSend = get().lastFailed !== null;
      const active = get().activeId;
      const serverReassigned =
        serverConversationId !== null && serverConversationId !== sentConversationId;
      if (!failedThisSend && active && (!sentConversationId || serverReassigned)) {
        api
          .fetchConversation(active)
          .then(({ messages }) => set({ messages }))
          .catch(() => undefined);
      }
    }
  },

  stopStreaming: () => {
    abortController?.abort();
    abortController = null;
    cancelRateLimitRetry();
    set((s) => ({
      streaming: false,
      sending: false,
      messages: s.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    }));
  },

  regenerate: async () => {
    const state = get();
    if (state.streaming || state.sending || !state.activeId) return;
    // آخرین پیام دستیار را حذف کن و تولید همان پاسخ را با درخواست regenerate از سرور بخواه
    const messages = [...state.messages];
    const lastAssistantIdx = messages.map((m) => m.role).lastIndexOf("assistant");
    if (lastAssistantIdx === -1) return;
    const lastUser = [...messages.slice(0, lastAssistantIdx)].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    // حذف زنجیره از آخرین پاسخ دستیار تا انتها در نمایش محلی
    set({ messages: messages.slice(0, lastAssistantIdx) });

    const tempAssistantId = `tmp-a-${Date.now()}`;
    set({
      sending: true,
      streaming: true,
      messages: [
        ...get().messages,
        {
          id: tempAssistantId,
          conversationId: state.activeId,
          role: "assistant",
          content: "",
          streaming: true,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    abortController = new AbortController();
    let assistantContent = "";
    let thinkingContent = "";
    const stepMap = new Map<string, AgentStep>();

    const updateAssistant = (patch: Partial<MessageWithSteps>) => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === tempAssistantId ? { ...m, ...patch } : m)),
      }));
    };

    try {
      await api.streamChat(
        {
          conversationId: state.activeId,
          mode: state.activeMode,
          content: lastUser.content,
          regenerate: true,
        },
        {
          signal: abortController.signal,
          onEvent: (streamEvent) => {
            const event = streamEvent as StreamEvent | XenonStepEvent;
            switch (event.type) {
              case "step":
                updateAssistant({ steps: mergeStepEvent(stepMap, event) });
                break;
              case "delta":
                assistantContent += event.text;
                updateAssistant({ content: assistantContent });
                break;
              case "thinking":
                thinkingContent += event.text;
                updateAssistant({ thinking: thinkingContent });
                break;
              case "sources":
                updateAssistant({ sources: event.sources });
                break;
              case "title":
                set((s) => ({
                  conversations: s.conversations.map((c) =>
                    c.id === get().activeId ? { ...c, title: event.title } : c
                  ),
                }));
                break;
              case "langWarning":
                updateAssistant({ langWarning: true });
                break;
              case "done": {
                const finalSteps = finalizeSteps(stepMap);
                if (finalSteps) updateAssistant({ steps: finalSteps });
                updateAssistant({
                  streaming: false,
                  servedModel: event.servedModel,
                  langWarning: event.langWarning,
                });
                break;
              }
              case "error":
                // متن خام خطای سرور نمایش داده نمی‌شود — متن دوستانهٔ دوزبانه
                console.error("[xenon] server error event (regenerate):", event.message);
                updateAssistant({
                  streaming: false,
                  content: assistantContent || `⚠️ ${translateNow("toast.requestFailed")}`,
                });
                break;
            }
          },
        }
      );
    } catch (err) {
      console.error("[xenon] regenerate stream failure:", err);
      const kind = classifyStreamFailure(err);
      if (kind === "aborted") {
        updateAssistant({
          streaming: false,
          content: assistantContent || translateNow("toast.stopped"),
        });
      } else if (assistantContent) {
        updateAssistant({ streaming: false, interrupted: true });
        toast({ title: translateNow("toast.streamInterrupted"), variant: "destructive" });
      } else {
        set({
          lastFailed: {
            content: "",
            mode: state.activeMode,
            regenerate: true,
            userId: "",
            assistantId: tempAssistantId,
          },
        });
        updateAssistant({
          streaming: false,
          content: `⚠️ ${translateNow("toast.connectionLost")}`,
        });
        toast({
          title: translateNow("toast.connectionLost"),
          description: translateNow("toast.retryHint"),
          variant: "destructive",
        });
      }
    } finally {
      set({ sending: false, streaming: false });
      abortController = null;
      // همگام‌سازی پیام‌ها با سرور تا شناسه‌ها درست بمانند
      api
        .fetchConversation(state.activeId)
        .then(({ messages }) => set({ messages }))
        .catch(() => undefined);
    }
  },

  retryLast: async () => {
    const lf = get().lastFailed;
    if (!lf || get().sending || get().streaming) return;
    set({ lastFailed: null });
    // تلاش دستی کاربر → شمارندهٔ خودکار ۴۲۹ صفر می‌شود تا بن‌بست پیش نیاید
    consecutiveRateLimitAutoRetries = 0;
    cancelRateLimitRetry();
    // حباب‌های خوش‌بینانهٔ تلاش ناموفق (کاربر + خطا) پاک می‌شوند تا ارسال مجدد تکراری نسازد
    if (lf.userId || lf.assistantId) {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== lf.userId && m.id !== lf.assistantId),
      }));
    }
    if (lf.regenerate) await get().regenerate();
    else await get().sendMessage(lf.content);
  },

  clearLastFailed: () => set({ lastFailed: null }),

  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),
  removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((x) => x.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),
  toggleImageGen: (on) => set((s) => ({ imageGenMode: on ?? !s.imageGenMode })),

  renameConversation: async (id, title) => {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
    await api.patchConversation(id, { title }).catch(() => undefined);
  },

  togglePin: async (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const pinned = !conv.pinned;
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)) }));
    await api.patchConversation(id, { pinned }).catch(() => undefined);
  },

  removeConversation: async (id) => {
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      messages: s.activeId === id ? [] : s.messages,
      activeId: s.activeId === id ? null : s.activeId,
    }));
    await api.deleteConversation(id).catch(() => undefined);
    get().refreshStats();
  },

  assignToFolder: async (id, folderId) => {
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, folderId } : c)),
    }));
    await api.patchConversation(id, { folderId }).catch(() => undefined);
  },

  createFolder: async (name, color) => {
    const folder = await api.createFolder(name, color).catch(() => null);
    if (folder) set((s) => ({ folders: [...s.folders, folder] }));
  },

  renameFolder: async (id, name) => {
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
    await api.patchFolder(id, { name }).catch(() => undefined);
  },

  removeFolder: async (id) => {
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      conversations: s.conversations.map((c) => (c.folderId === id ? { ...c, folderId: null } : c)),
    }));
    await api.deleteFolder(id).catch(() => undefined);
  },

  addMemory: async (content, category = "general") => {
    const memory = await api.createMemory(content, category).catch(() => null);
    if (memory) set((s) => ({ memories: [...s.memories, memory] }));
  },

  removeMemory: async (id) => {
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
    await api.deleteMemory(id).catch(() => undefined);
  },

  speakMessage: async (message) => {
    if (get().speakingId) {
      get().stopSpeaking();
      if (get().speakingId === message.id) return;
    }
    set({ speakingId: message.id });
    try {
      const { audio, format } = await api.synthesizeSpeech(message.content.slice(0, 1000));
      currentAudio = new Audio(`data:audio/${format};base64,${audio}`);
      currentAudio.onended = () => set({ speakingId: null });
      await currentAudio.play();
    } catch {
      set({ speakingId: null });
      throw new Error(translateNow("message.toast.ttsFailed"));
    }
  },

  stopSpeaking: () => {
    currentAudio?.pause();
    currentAudio = null;
    set({ speakingId: null });
  },
}));
