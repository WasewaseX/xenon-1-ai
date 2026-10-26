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

// ---------- جریان گفتگو (SSE) ----------
export interface ChatStreamHandlers {
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat(body: object, handlers: ChatStreamHandlers): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "شروع جریان پاسخ ناموفق بود");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
