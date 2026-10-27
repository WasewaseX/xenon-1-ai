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

// --- فراخوانی ابزار (function calling) — حلقه عامل خودکار ---

/** خطایی که یعنی درگاه پارامترهای ابزار را نپذیرفت → مسیر جایگزین اسکریپتی */
export class ToolsUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolsUnsupportedError";
  }
}

export interface ToolFunctionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolSpec {
  type: "function";
  function: ToolFunctionSpec;
}

/** فراخوان ابزار خام همان‌طور که از درگاه می‌آید */
export interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** پیام حلقه عامل — شامل نقش tool و tool_calls برای پروتکل فراخوانی ابزار */
export interface ToolLoopMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: RawToolCall[];
  tool_call_id?: string;
}

export interface CompleteWithToolsResult {
  content: string;
  reasoning: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  rawToolCalls: RawToolCall[];
  servedModel?: string;
}

/**
 * فراخوانی غیرجریانی با ابزارها (GLM function calling).
 * پارامترهای tools/tool_choice از طریق SDK به درگاه GLM عبور می‌کنند
 * (بدنه SDK دارای index-signature است و کلیدهای اضافه را پاس می‌دهد).
 */
export async function completeWithTools(
  messages: ToolLoopMessage[],
  opts: { tools?: ToolSpec[]; toolChoice?: "auto" | "none"; thinking?: boolean } = {}
): Promise<CompleteWithToolsResult> {
  const zai = await getZai();
  const body: Record<string, unknown> = {
    messages: messages as unknown[],
    stream: false,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice === "none" ? "none" : "auto";
  }

  let res: {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: RawToolCall[];
      };
    }>;
  };
  try {
    res = (await zai.chat.completions.create(body as never)) as typeof res;
  } catch (err) {
    // اگر درگاه پارامتر tools را نپذیرفت، به‌صورت صریح علامت بزن تا فراخوان
    // به مسیر پژوهش اسکریپتی قدیمی سقوط کند (graceful degradation).
    if (opts.tools?.length) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/tool|function.?call|unrecognized|unknown (field|argument)|invalid request|unsupported/i.test(msg)) {
        throw new ToolsUnsupportedError(msg);
      }
    }
    throw err;
  }

  const message = res?.choices?.[0]?.message ?? {};
  const rawToolCalls: RawToolCall[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls = rawToolCalls
    .filter((tc) => tc?.function?.name)
    .map((tc) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: tc.function.name,
      arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}),
    }));
  return {
    content: message.content ?? "",
    reasoning: message.reasoning_content ?? "",
    toolCalls,
    rawToolCalls: toolCalls.map((tc, i) => rawToolCalls[i]).filter(Boolean),
    servedModel: res?.model,
  };
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

// --- خواندن صفحه وب (حالت ایجنت) ---

const PAGE_READER_TIMEOUT_MS = 20_000;
const PAGE_TEXT_LIMIT = 3_000;

/** نتیجه خواندن یک صفحه وب */
export interface PageReadResult {
  url: string;
  title: string;
  text: string;
  publishedTime?: string;
}

interface SdkPageReaderResult {
  code?: number;
  data?: {
    html?: string;
    publishedTime?: string;
    title?: string;
    url?: string;
  };
}

/** استخراج متن خوانا از HTML خام — بدون وابستگی بیرونی */
function htmlToReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<\/(p|div|section|article|header|footer|li|ul|ol|table|tr|h[1-6]|blockquote|pre|figcaption)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * خواندن یک صفحه وب با ابزار page_reader درگاه (همان SDK فایل).
 * با مهلت زمانی (پیش‌فرض ۲۰ ثانیه)، سقف نویسه قابل تنظیم و استخراج متن خوانا؛
 * در هر خطا null برمی‌گرداند.
 */
export async function pageReader(
  url: string,
  timeoutMs = PAGE_READER_TIMEOUT_MS,
  maxChars: number = PAGE_TEXT_LIMIT
): Promise<PageReadResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const zai = await getZai();
    const raw = zai.functions.invoke("page_reader", { url }) as unknown as Promise<SdkPageReaderResult>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("page_reader timeout")), timeoutMs);
    });
    const res = await Promise.race([raw, timeout]);
    const html = res?.data?.html ?? "";
    if (!html) return null;
    const text = htmlToReadableText(html).slice(0, maxChars);
    if (!text) return null;
    return {
      url: res?.data?.url ?? url,
      title: (res?.data?.title ?? "").trim(),
      text,
      publishedTime: res?.data?.publishedTime,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
 * Convert text to speech — returns complete base64 audio.
 * Uses non-streaming WAV (verified against the live gateway: this combo returns raw
 * WAV bytes; mp3 is rejected by the gateway with code 1214, and streaming is
 * PCM-only per the TTS contract).
 */
export async function tts(
  text: string,
  voice = "tongtong",
  speed = 1.0
): Promise<{ base64: string; format: string } | null> {
  const zai = await getZai();
  // API hard limit: 1024 characters per request
  const res = (await zai.audio.tts.create({
    input: text.slice(0, 1024),
    voice,
    speed,
    stream: false,
    response_format: "wav",
  })) as unknown as Record<string, unknown>;

  // Preferred path: standard Response object → arrayBuffer with raw WAV bytes
  const maybeArrayBuffer = (res as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer;
  if (typeof maybeArrayBuffer === "function") {
    const arrayBuffer = await maybeArrayBuffer.call(res);
    if (arrayBuffer && arrayBuffer.byteLength > 44) {
      const head = String.fromCharCode(...new Uint8Array(arrayBuffer).slice(0, 4));
      // Raw binary audio (RIFF/WAV) — encode directly
      if (head === "RIFF") {
        const base64 = Buffer.from(new Uint8Array(arrayBuffer)).toString("base64");
        if (base64) return { base64, format: "wav" };
      }
      // Otherwise it may be SSE text from a stream-shaped response — fall through
    }
  }

  // Fallback 1: streaming body (SSE chunks of base64 text)
  const body = (res as unknown as { body?: ReadableStream<Uint8Array> }).body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
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
            // partial block
          }
        }
      }
    }
    const base64 = chunks.join("");
    if (base64) return { base64, format };
    return null;
  }

  // Fallback 2: plain JSON-ish payloads carrying base64 directly
  const data =
    (res?.data as Array<{ base64?: string }>)?.[0]?.base64 ??
    (res?.audio as string) ??
    (res?.base64 as string);
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
