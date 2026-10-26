// Xenon 1 AI — Shared Types
// تایپ‌های مشترک بین فرانت‌اند و بک‌اند

export type ChatMode = "general" | "reasoning" | "coding" | "research" | "agent";

export type Role = "user" | "assistant";

export interface AttachmentMeta {
  id: string;
  name: string;
  type: string; // mime
  size: number;
  url: string; // /api/files/...
  kind: "image" | "audio" | "text" | "other";
}

export interface ResearchSource {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date?: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  thinking?: string | null;
  model?: string | null;
  servedModel?: string | null;
  attachments?: AttachmentMeta[] | null;
  sources?: ResearchSource[] | null;
  langWarning?: boolean;
  createdAt: string;
  streaming?: boolean; // فقط در کلاینت
}

export interface ConversationDTO {
  id: string;
  title: string;
  folderId: string | null;
  pinned: boolean;
  mode: ChatMode;
  systemInstruction?: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface FolderDTO {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface MemoryDTO {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingProfile {
  id: ChatMode;
  label: string;
  description: string;
  icon: string; // lucide icon name
  thinking: boolean;
  webSearch: boolean;
}

export interface StatsDTO {
  conversations: number;
  messages: number;
  memories: number;
  byKind: Record<string, number>;
}

// --- گام‌های عامل (حالت ایجنت) ---
export type AgentStepKind = "plan" | "search" | "read" | "synthesize";

export type AgentStepState = "start" | "done";

/** یک گام برای نمایش در تایم‌لاین فعالیت عامل */
export interface AgentStepRecord {
  id: string;
  kind: AgentStepKind;
  title: string;
  summary?: string;
}

/** قالب ذخیره گام‌های عامل در ستون thinking پیام دستیار */
export interface AgentStepsPayload {
  format: "xenon-steps-v1";
  steps: AgentStepRecord[];
}

// --- رویدادهای SSE جریان گفتگو ---
export type StreamEvent =
  | { type: "meta"; conversationId: string; userMessageId: string; assistantMessageId: string; servedModel?: string }
  | { type: "delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "step"; id: string; kind: AgentStepKind; title: string; state: AgentStepState; summary?: string }
  | { type: "sources"; sources: ResearchSource[] }
  | { type: "title"; title: string }
  | { type: "langWarning"; hint: string }
  | { type: "done"; messageId: string; servedModel?: string; langWarning?: boolean }
  | { type: "error"; message: string };

export interface ChatRequest {
  conversationId?: string | null;
  mode: ChatMode;
  content: string;
  attachments?: AttachmentMeta[];
  regenerate?: boolean;
}
