// Xenon 1 AI — Client API Layer
// تمام درخواست‌های شبکه‌ای کلاینت به APIهای پلتفرم

import type {
  AttachmentMeta,
  ChatMode,
  ConversationDTO,
  FolderDTO,
  MemoryDTO,
  MessageDTO,
  ResearchSource,
  StatsDTO,
  StreamEvent,
} from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // پادزهر درخواست‌های معلق: اگر سرور پاسخ ندهد، اتصال را رها کن تا UI قفل نشود
    signal: init?.signal ?? AbortSignal.timeout(90_000),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `خطای شبکه: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------- گفتگوها ----------
export async function fetchConversations(): Promise<ConversationDTO[]> {
  return jsonFetch("/api/conversations");
}

export async function fetchConversation(id: string): Promise<{ conversation: ConversationDTO; messages: MessageDTO[] }> {
  return jsonFetch(`/api/conversations/${id}`);
}

export async function patchConversation(id: string, patch: Partial<Pick<ConversationDTO, "title" | "pinned" | "folderId" | "mode" | "systemInstruction">>): Promise<ConversationDTO> {
  return jsonFetch(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
}

// ---------- پوشه‌ها ----------
export async function fetchFolders(): Promise<FolderDTO[]> {
  return jsonFetch("/api/folders");
}

export async function createFolder(name: string, color?: string): Promise<FolderDTO> {
  return jsonFetch("/api/folders", { method: "POST", body: JSON.stringify({ name, color }) });
}

export async function patchFolder(id: string, patch: Partial<Pick<FolderDTO, "name" | "color">>): Promise<FolderDTO> {
  return jsonFetch(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteFolder(id: string): Promise<void> {
  await fetch(`/api/folders/${id}`, { method: "DELETE" });
}

// ---------- حافظه ----------
export async function fetchMemories(): Promise<MemoryDTO[]> {
  return jsonFetch("/api/memories");
}

export async function createMemory(content: string, category = "general"): Promise<MemoryDTO> {
  return jsonFetch("/api/memories", { method: "POST", body: JSON.stringify({ content, category }) });
}

export async function deleteMemory(id: string): Promise<void> {
  await fetch(`/api/memories/${id}`, { method: "DELETE" });
}

// ---------- آپلود ----------
export async function uploadFile(file: File): Promise<AttachmentMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "آپلود فایل ناموفق بود");
  }
  return res.json() as Promise<AttachmentMeta>;
}

// ---------- ابزارهای هوشمند ----------
export async function transcribeAudio(fileBase64: string): Promise<{ text: string }> {
  return jsonFetch("/api/asr", { method: "POST", body: JSON.stringify({ file_base64: fileBase64 }) });
}

export async function synthesizeSpeech(text: string): Promise<{ audio: string; format: string }> {
  return jsonFetch("/api/tts", { method: "POST", body: JSON.stringify({ text }) });
}

export async function generateImages(prompt: string, size?: string): Promise<{ images: Array<{ base64: string; mime: string }> }> {
  return jsonFetch("/api/image-gen", { method: "POST", body: JSON.stringify({ prompt, size }) });
}

export async function searchWeb(query: string): Promise<{ sources: ResearchSource[] }> {
  return jsonFetch("/api/search", { method: "POST", body: JSON.stringify({ query }) });
}

export async function fetchStats(): Promise<StatsDTO> {
  return jsonFetch("/api/stats");
}

// ---------- جریان گفتگو (SSE) با تاب‌آوری شبکه ----------

export interface ChatStreamHandlers {
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

/** جریان هرگز برقرار نشد (حتی بعد از تلاش مجدد خودکار). */
export class StreamStartError extends Error {
  constructor(message = "stream-start-failed") {
    super(message);
    this.name = "StreamStartError";
  }
}

/** جریان برقرار شده بود اما وسط کار قطع شد (افت شبکه یا سکوت طولانی). */
export class StreamInterruptedError extends Error {
  constructor(message = "stream-interrupted") {
    super(message);
    this.name = "StreamInterruptedError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// فقط خطاهای گذرای لایهٔ شبکه/گیت‌وی تلاش مجدد می‌شوند. خطاهای 4xx نهایی‌اند.
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_CONNECT_ATTEMPTS = 3;
// سرور هر ۱۵ ثانیه «: ping» می‌فرستد؛ سکوت بیشتر از این حد یعنی لوله مرده است.
const STALL_TIMEOUT_MS = 70_000;

/**
 * اتصال جریان را با تلاش مجدد خودکار برقرار می‌کند.
 * نکتهٔ حیاتی: تلاش مجدد فقط وقتی امن است که «هیچ بایتی» دریافت نشده باشد
 * (خطای fetch یا 5xx گیت‌وی) — در این حالت سرور هیچ گفتگویی نساخته است.
 */
async function openChatStream(body: object, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(600 * (attempt - 1)); // 600ms, 1200ms
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok && res.body) return res;
      const text = await res.text().catch(() => "");
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new Error(text || `HTTP ${res.status}`);
        continue;
      }
      throw new Error(text || `HTTP ${res.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      // TypeError: NetworkError / Failed to fetch — درخواست به سرور نرسیده،
      // پس تلاش مجدد هیچ دادهٔ تکراری نمی‌سازد.
      lastError = err;
      continue;
    }
  }
  throw new StreamStartError(lastError instanceof Error ? lastError.message : undefined);
}

export async function streamChat(body: object, handlers: ChatStreamHandlers): Promise<void> {
  const res = await openChatStream(body, handlers.signal);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // خواندن یک chunk با نگهبان سکوت: اگر جریان بیش از حد مجاز ساکت بماند،
  // به‌جای معلق ماندن ابدی، خطای قطع‌شدگی پرتاب می‌شود.
  const readWithStallGuard = () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StreamInterruptedError()), STALL_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };

  while (true) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await readWithStallGuard();
    } catch (err) {
      try {
        await reader.cancel();
      } catch {
        // جریان از قبل بسته شده
      }
      throw err;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        try {
          handlers.onEvent(JSON.parse(data) as StreamEvent);
        } catch {
          // رخداد ناقص — نادیده
        }
      }
    }
  }
}
