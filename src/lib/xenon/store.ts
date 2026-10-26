// Xenon 1 AI — Client State (Zustand)
// مدیریت وضعیت کلاینت: گفتگوها، پیام‌ها، جریان زنده، حافظه

import { create } from "zustand";
import * as api from "./api";
import type {
  AttachmentMeta,
  ChatMode,
  ConversationDTO,
  FolderDTO,
  MemoryDTO,
  MessageDTO,
  StatsDTO,
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
    } catch {
      set({ loadingMessages: false });
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
    const hadActiveId = state.activeId;

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

    const updateAssistant = (patch: Partial<MessageDTO>) => {
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
          name: `تصویر-${i + 1}.${img.mime === "image/jpeg" ? "jpg" : "png"}`,
          type: img.mime,
          size: Math.round((img.base64.length * 3) / 4),
          url: `data:${img.mime};base64,${img.base64}`,
          kind: "image",
        }));
        const note = `تصویر برای درخواست «${text}» تولید شد.`;
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
            onEvent: (event) => {
              switch (event.type) {
                case "meta":
                  if (!hadActiveId && !conversationCreated) {
                    conversationCreated = true;
                    // گفتگوی تازه ساخته شد — در فهرست قرار بده
                    set((s) => ({
                      activeId: event.conversationId,
                    }));
                    get().refreshSidebar();
                  }
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
                case "done":
                  updateAssistant({
                    streaming: false,
                    id: event.messageId !== tempAssistantId ? event.messageId : tempAssistantId,
                    servedModel: event.servedModel,
                    langWarning: event.langWarning,
                  });
                  break;
                case "error":
                  updateAssistant({
                    streaming: false,
                    content: assistantContent || `⚠️ ${event.message}`,
                  });
                  break;
              }
            },
          }
        );
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      updateAssistant({
        streaming: false,
        content:
          assistantContent ||
          (aborted ? "⏹ تولید پاسخ متوقف شد." : `⚠️ ${err instanceof Error ? err.message : "خطای ارتباط با سرور"}`),
      });
    } finally {
      set({ sending: false, streaming: false });
      abortController = null;
      get().refreshSidebar();
      get().refreshStats();
      // اگر گفتگوی تازه بود، پیام‌ها را برای اطمینان از شناسه‌های واقعی همگام کن
      const active = get().activeId;
      if (active && !hadActiveId) {
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

    const updateAssistant = (patch: Partial<MessageDTO>) => {
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
          onEvent: (event) => {
            switch (event.type) {
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
              case "done":
                updateAssistant({
                  streaming: false,
                  servedModel: event.servedModel,
                  langWarning: event.langWarning,
                });
                break;
              case "error":
                updateAssistant({
                  streaming: false,
                  content: assistantContent || `⚠️ ${event.message}`,
                });
                break;
            }
          },
        }
      );
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      updateAssistant({
        streaming: false,
        content:
          assistantContent ||
          (aborted ? "⏹ تولید پاسخ متوقف شد." : `⚠️ ${err instanceof Error ? err.message : "خطای ارتباط با سرور"}`),
      });
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
      throw new Error("تولید گفتار ناموفق بود");
    }
  },

  stopSpeaking: () => {
    currentAudio?.pause();
    currentAudio = null;
    set({ speakingId: null });
  },
}));
