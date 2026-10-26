// Xenon 1 AI — LLM Gateway Wrapper (server-only)
// لایه دسترسی به درگاه مدل‌ها: زبانی، بینایی، گفتار، تصویر، جست‌وجو
// z-ai-web-dev-sdk فقط در سمت سرور استفاده می‌شود.

import ZAI from "z-ai-web-dev-sdk";
import type { ResearchSource } from "./types";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SseChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    delta?: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
    };
    message?: {
      role?: string;
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
}

let zaiInstance: ZAI | null = null;

export async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * درخواست زبانی غیرجریانی.
 */
export async function complete(
  messages: LlmMessage[],
  opts: { thinking?: boolean; model?: string } = {}
): Promise<{ content: string; servedModel?: string }> {
  const zai = await getZai();
  const res = await zai.chat.completions.create({
    messages,
    stream: false,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
    ...(opts.model ? { model: opts.model } : {}),
  });
  const content: string = res?.choices?.[0]?.message?.content ?? "";
  return { content, servedModel: res?.model };
}

/**
 * درخواست زبانی جریانی — یک ReadableStream<Uint8Array> از SSE خامِ درگاه برمی‌گرداند.
 * فراخوان مسئول تجزیه رخدادها با parseSdkStream است.
 */
export async function completeStream(
  messages: LlmMessage[],
  opts: { thinking?: boolean; model?: string } = {}
): Promise<ReadableStream<Uint8Array> | null> {
  const zai = await getZai();
  const body = await zai.chat.completions.create({
    messages,
    stream: true,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
    ...(opts.model ? { model: opts.model } : {}),
  });
  return body as unknown as ReadableStream<Uint8Array>;
}

/**
 * تجزیه جریان SSE خام درگاه به رخدادهای ساخت‌یافته.
 * هر رخداد یک شیء delta/content/reasoning/finish/served برمی‌گرداند.
 */
export async function* parseSdkStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<
  | { kind: "content"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "finish"; servedModel?: string }
  | { kind: "served"; servedModel: string }
> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let servedModel: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // رخدادهای SSE با خط خالی از هم جدا می‌شوند
      const events = buffer.split(/\n\n+/);
      buffer = events.pop() ?? "";

      for (const evt of events) {
        for (const line of evt.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as SseChunk;
            if (json.model && !servedModel) servedModel = json.model;
            const delta = json.choices?.[0]?.delta;
            if (delta?.reasoning_content) yield { kind: "reasoning", text: delta.reasoning_content };
            if (delta?.content) yield { kind: "content", text: delta.content };
            const finish = json.choices?.[0]?.finish_reason;
            if (finish) yield { kind: "finish", servedModel };
            else if (json.model) yield { kind: "served", servedModel: json.model };
          } catch {
            // بلوک ناقص یا غیر JSON — نادیده گرفته می‌شود
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // noop
    }
  }
}

/**
 * درخواست بینایی (تصویر) جریانی — مدل glm-4.6v.
 */
export async function completeVisionStream(
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>
): Promise<ReadableStream<Uint8Array> | null> {
  const zai = await getZai();
  const body = await zai.chat.completions.createVision({
    model: "glm-4.6v",
    messages: messages as never,
    stream: true,
    thinking: { type: "disabled" },
  });
  return body as unknown as ReadableStream<Uint8Array>;
}

/**
 * جست‌وجوی وب برای حالت پژوهش.
 */
export async function webSearch(query: string, num = 6, recencyDays?: number): Promise<ResearchSource[]> {
  const zai = await getZai();
  const args: { query: string; num?: number; recency_days?: number } = { query, num };
  if (recencyDays) args.recency_days = recencyDays;
  const results = await zai.functions.invoke("web_search", args);
  const arr = Array.isArray(results) ? results : [];
  return arr.slice(0, num).map((r, i) => ({
    url: r.url ?? "",
    name: r.name ?? "",
    snippet: r.snippet ?? "",
    host_name: r.host_name ?? "",
    rank: r.rank ?? i + 1,
    date: r.date,
  }));
}

/**
 * تبدیل متن به گفتار — جریانی، خروجی base64 کامل (WAV).
 */
export async function tts(
  text: string,
  voice = "tongtong",
  speed = 1.0
): Promise<{ base64: string; format: string } | null> {
  const zai = await getZai();
  const res = (await zai.audio.tts.create({
    input: text.slice(0, 1200),
    voice,
    speed,
    stream: true,
    response_format: "wav",
  })) as unknown as { body?: ReadableStream<Uint8Array> };

  if (res?.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const chunks: string[] = [];
    let format = "wav";
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
          try {
            const json = JSON.parse(trimmed.slice(5).trim()) as SseChunk & {
              choices?: Array<{ delta?: { content?: string; return_format?: string } }>;
            };
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) chunks.push(delta.content);
            if (delta?.return_format) format = delta.return_format;
          } catch {
            // بلوک ناقص
          }
        }
      }
    }
    const base64 = chunks.join("");
    if (base64) return { base64, format };
    return null;
  }

  // جایگزین: پاسخ غیرجریانی
  const fallback = res as unknown as Record<string, unknown>;
  const data =
    (fallback?.data as Array<{ base64?: string }>)?.[0]?.base64 ??
    (fallback?.audio as string) ??
    (fallback?.base64 as string);
  if (data && typeof data === "string") {
    return { base64: data.replace(/^data:[^;]+;base64,/, ""), format: "wav" };
  }
  return null;
}

/**
 * تبدیل گفتار به متن (فارسی/انگلیسی).
 */
export async function asr(fileBase64: string): Promise<string> {
  const zai = await getZai();
  const res = await zai.audio.asr.create({ file_base64: fileBase64 });
  return res?.text ?? "";
}

/**
 * تولید تصویر از متن — خروجی base64 با نوع MIME تشخیص‌داده‌شده.
 */
export async function generateImage(
  prompt: string,
  size: "1024x1024" | "768x1344" | "864x1152" | "1344x768" | "1152x864" | "1440x720" | "720x1440" = "1024x1024"
): Promise<Array<{ base64: string; mime: string }>> {
  const zai = await getZai();
  const res = await zai.images.generations.create({ prompt, size });
  const arr = res?.data ?? [];
  return arr
    .map((d) => d.base64)
    .filter(Boolean)
    .map((base64) => ({
      base64,
      mime: detectImageMime(base64),
    }));
}

/** تشخیص نوع تصویر از امضای base64 */
function detectImageMime(base64: string): string {
  const head = base64.slice(0, 8);
  if (head.startsWith("/9j/")) return "image/jpeg";
  if (head.startsWith("iVBORw0")) return "image/png";
  if (head.startsWith("R0lGOD")) return "image/gif";
  if (head.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
