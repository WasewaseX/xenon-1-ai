// Xenon 1 AI — Chat API (streaming, server-only)
// جریان گفتگو با مسیریابی بین حالت‌ها، حافظه، پژوهش وب، بینایی و نگهبان زبان

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  complete,
  completeStream,
  completeVisionStream,
  parseSdkStream,
  asr,
  webSearch,
  pageReader,
} from "@/lib/xenon/llm";
import { sseStream } from "@/lib/xenon/sse";
import {
  buildSystemPrompt,
  TITLE_PROMPT,
  AGENT_PLANNER_PROMPT,
  AGENT_NO_RESULTS_NOTE,
  AGENT_FALLBACK_NOTE,
} from "@/lib/xenon/prompts";
import { detectUnexpectedCjk, detectLanguage, sanitizeOutput, mapUpstreamError } from "@/lib/xenon/language-guard";
import {
  MAX_ATTACHMENT_TEXT,
  MAX_CONTEXT_MESSAGES,
  AGENT_MAX_SEARCHES,
  AGENT_MAX_READS,
  AGENT_MAX_SOURCES,
  AGENT_TIME_BUDGET_MS,
} from "@/lib/xenon/models";
import type {
  AttachmentMeta,
  ChatMode,
  ResearchSource,
  AgentStepKind,
  AgentStepRecord,
  AgentStepsPayload,
} from "@/lib/xenon/types";
import { existsSync, readFileSync } from "fs";
import path from "path";

export const maxDuration = 300;

const UPLOAD_DIR = path.join(process.cwd(), "upload");
const VALID_MODES: ChatMode[] = ["general", "reasoning", "coding", "research", "agent"];

function readUploadFile(url: string): Buffer | null {
  try {
    const name = url.replace(/^\/api\/files\//, "");
    const safe = path.basename(name);
    const full = path.join(UPLOAD_DIR, safe);
    if (!full.startsWith(UPLOAD_DIR) || !existsSync(full)) return null;
    return readFileSync(full);
  } catch {
    return null;
  }
}

function attachmentKind(type: string): AttachmentMeta["kind"] {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("text/") || /json|csv|xml|javascript|typescript|yaml/.test(type)) return "text";
  return "other";
}

// --- ابزارهای حالت عامل (agent) ---

/** کوتاه‌سازی متن برای تیتر/خلاصه گام‌ها */
function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** استخراج میزبان از URL برای تیتر گام خواندن */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return shorten(url, 40);
  }
}

/**
 * تجزیه پایدار خروجی برنامه‌ریز عامل: حذف بلوک کد، یافتن JSON،
 * و بازگشت کوئری‌های معتبر (حداکثر ۳). در هر خطا خروجی خالی.
 */
function parseAgentPlan(raw: string): { goal: string; queries: string[] } {
  let text = (raw ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(text) as { goal?: unknown; queries?: unknown };
    const queries = Array.isArray(obj.queries)
      ? obj.queries
          .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          .map((q) => q.trim())
          .slice(0, 3)
      : [];
    const goal = typeof obj.goal === "string" && obj.goal.trim() ? obj.goal.trim() : "";
    if (queries.length > 0) return { goal, queries };
  } catch {
    // جایگزین در فراخوان ساخته می‌شود
  }
  return { goal: "", queries: [] };
}

/** ادغام نتایج جست‌وجو در آرایه منابع با حذف تکراری بر اساس URL و سقف کل */
function mergeSources(current: ResearchSource[], incoming: ResearchSource[], cap: number): void {
  const seen = new Set(current.map((s) => s.url));
  for (const s of incoming) {
    if (current.length >= cap) break;
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    current.push(s);
  }
}

/** انتخاب تا max صفحه برای خواندن: ترجیح میزبان‌های متنوع، بدون تکرار */
function pickPagesToRead(all: ResearchSource[], max: number, alreadyRead: Set<string>): ResearchSource[] {
  const picked: ResearchSource[] = [];
  const hosts = new Set<string>();
  // گذر اول: بهترین نتیجه از هر میزبان (تنوع میزبان‌ها)
  for (const s of all) {
    if (picked.length >= max) break;
    if (alreadyRead.has(s.url)) continue;
    const host = s.host_name || hostOf(s.url);
    if (!host || hosts.has(host)) continue;
    hosts.add(host);
    alreadyRead.add(s.url);
    picked.push(s);
  }
  // گذر دوم: تکمیل سهمیه با بهترین باقی‌مانده‌ها
  for (const s of all) {
    if (picked.length >= max) break;
    if (alreadyRead.has(s.url)) continue;
    alreadyRead.add(s.url);
    picked.push(s);
  }
  return picked;
}

interface ChatBody {
  conversationId?: string | null;
  mode?: string;
  content?: string;
  attachments?: AttachmentMeta[];
  regenerate?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "بدنه درخواست نامعتبر است" }, { status: 400 });
  }

  const mode = (VALID_MODES.includes(body.mode as ChatMode) ? body.mode : "general") as ChatMode;
  const content = sanitizeOutput(body.content ?? "").trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 6) : [];

  if (!content && attachments.length === 0) {
    return Response.json({ error: "پیام خالی است" }, { status: 400 });
  }

  return sseStream(async (emit, signal) => {
    // ---------- ۱) گفتگو: بازیابی یا ساخت ----------
    let conversation = body.conversationId
      ? await db.conversation.findUnique({ where: { id: body.conversationId } })
      : null;
    if (!conversation && body.conversationId) {
      // Self-heal: the client referenced a conversation that no longer exists
      // (stale tab, database reset). Recover by creating a fresh conversation
      // instead of hard-failing with "conversation not found".
      console.warn("[chat] stale conversationId, self-healing with a new conversation:", body.conversationId);
      conversation = await db.conversation.create({ data: { mode } });
      body.conversationId = conversation.id;
    }
    if (!conversation) {
      conversation = await db.conversation.create({ data: { mode } });
    }

    // ---------- ۲) پیام کاربر (یا بازتولید) ----------
    let userContent = content;
    let userAttachments = attachments;

    if (body.regenerate) {
      // حذف پاسخ‌های دستیارِ بعد از آخرین پیام کاربر
      const msgs = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      const lastUserIdx = msgs.map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx === -1) {
        emit({ type: "error", message: "پیامی برای بازتولید وجود ندارد" });
        return;
      }
      const trailing = msgs.slice(lastUserIdx + 1).filter((m) => m.role === "assistant");
      await db.message.deleteMany({ where: { id: { in: trailing.map((m) => m.id) } } });
      const lastUser = msgs[lastUserIdx];
      userContent = lastUser.content;
      userAttachments = lastUser.attachments ? (JSON.parse(lastUser.attachments) as AttachmentMeta[]) : [];
    } else {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content,
          attachments: attachments.length ? JSON.stringify(attachments) : null,
        },
      });
    }

    const firstUserMessage = await db.message.findFirst({
      where: { conversationId: conversation.id, role: "user" },
      orderBy: { createdAt: "asc" },
    });

    // ---------- ۳) دستور سیستمی: هویت + سیاست زبان + حالت + حافظه ----------
    const [memories, dbConversation] = await Promise.all([
      db.memory.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      db.conversation.findUnique({ where: { id: conversation.id } }),
    ]);
    const systemPrompt = buildSystemPrompt({
      mode,
      memories: memories.map((m) => m.content),
      systemInstruction: dbConversation?.systemInstruction,
    });

    // ---------- ۴) پیوست‌ها: متن و صدا ----------
    const hasImages = userAttachments.some((a) => attachmentKind(a.type) === "image");
    const audioTexts: string[] = [];
    const textBlocks: string[] = [];

    for (const att of userAttachments) {
      const kind = attachmentKind(att.type);
      if (kind === "audio" && !hasImages) {
        try {
          const buf = readUploadFile(att.url);
          if (buf) {
            const text = await asr(buf.toString("base64"));
            if (text.trim()) audioTexts.push(text.trim());
          }
        } catch {
          audioTexts.push("(بخش صوتی قابل تبدیل به متن نبود)");
        }
      } else if (kind === "text") {
        const buf = readUploadFile(att.url);
        if (buf) {
          const decoded = buf.toString("utf-8").slice(0, MAX_ATTACHMENT_TEXT);
          textBlocks.push(`— فایل «${att.name}» —\n${decoded}`);
        }
      }
    }

    const transcribedAudio = audioTexts.join("\n");
    const attachmentContext = [
      ...(transcribedAudio ? [`متن پیام صوتی کاربر: «${transcribedAudio}»`] : []),
      ...textBlocks,
    ].join("\n\n");

    // ---------- ۵) حالت پژوهش: جست‌وجوی وب ----------
    let sources: ResearchSource[] = [];
    if (mode === "research" && !hasImages && userContent) {
      try {
        sources = await webSearch(userContent, 6);
        if (sources.length > 0) emit({ type: "sources", sources });
      } catch {
        emit({
          type: "delta",
          text: "⚠️ جست‌وجوی وب در دسترس نیست؛ بر اساس دانش داخلی پاسخ می‌دهم.\n\n",
        });
      }
    }

    const researchContext =
      sources.length > 0
        ? `\n\nنتایج جست‌وجوی وب (برای ارجاع‌دهی با شماره [n] استفاده کن):\n${sources
            .map(
              (s, i) =>
                `[${i + 1}] ${s.name} — ${s.host_name}\nخلاصه: ${s.snippet}\nURL: ${s.url}`
            )
            .join("\n\n")}`
        : "";

    // ---------- ۶) تاریخچه گفتگو ----------
    const history = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: MAX_CONTEXT_MESSAGES,
    });
    history.reverse();
    const historyMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // ---------- ۷) مسیر بینایی یا زبانی + جریان ----------
    let assistantContent = "";
    let thinkingContent = "";
    let servedModel: string | undefined;
    const assistantMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        model: mode,
      },
    });

    emit({
      type: "meta",
      conversationId: conversation.id,
      userMessageId: "persisted",
      assistantMessageId: assistantMessage.id,
    });

    const pushDelta = (text: string) => {
      assistantContent += text;
      emit({ type: "delta", text });
    };

    // ---------- ابزارهای گام عامل (فقط حالت agent) ----------
    const agentSteps: AgentStepRecord[] = [];
    let agentStepCounter = 0;

    /** شروع یک گام عامل: رخداد start را می‌فرستد و تابع done را برمی‌گرداند */
    const startAgentStep = (kind: AgentStepKind, title: string) => {
      agentStepCounter += 1;
      const id = `s${agentStepCounter}`;
      agentSteps.push({ id, kind, title });
      emit({ type: "step", id, kind, title, state: "start" });
      return {
        id,
        done: (summary?: string) => {
          const rec = agentSteps.find((st) => st.id === id);
          if (rec && summary !== undefined) rec.summary = summary;
          emit({ type: "step", id, kind, title, state: "done", summary });
        },
      };
    };

    /**
     * حلقه پژوهش عامل: برنامه‌ریزی → جست‌وجوها → خواندن صفحه‌ها.
     * رخدادهای step/sources را می‌فرستد و بلوک زمینه سنتز را برمی‌گرداند.
     * هر فراخوانی بیرونی در try/catch است؛ عامل همیشه به سنتز می‌رسد.
     */
    const runAgentResearch = async (): Promise<string> => {
      const deadline = Date.now() + AGENT_TIME_BUDGET_MS;

      // --- گام ۱: برنامه‌ریزی (LLM غیرجریانی) ---
      const planStep = startAgentStep("plan", "Planning the research");
      let goal = userContent;
      let queries: string[] = [shorten(userContent, 200)];
      try {
        const historyBrief = historyMessages
          .slice(0, -1)
          .slice(-6)
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${shorten(m.content, 200)}`)
          .join("\n");
        const plan = await complete(
          [
            { role: "system", content: AGENT_PLANNER_PROMPT },
            {
              role: "user",
              content: `Recent conversation summary:\n${historyBrief || "(start of conversation)"}\n\nUser's current request:\n${shorten(userContent, 500)}`,
            },
          ],
          { thinking: false }
        );
        const parsed = parseAgentPlan(plan.content);
        if (parsed.queries.length > 0) {
          queries = parsed.queries;
          goal = parsed.goal || userContent;
        }
      } catch (err) {
        console.warn("[chat] agent planner failed; using the raw message as query:", err);
      }
      planStep.done(shorten(goal, 100));

      // --- گام ۲: جست‌وجوهای وب (حداکثر ۳) ---
      for (const query of queries.slice(0, AGENT_MAX_SEARCHES)) {
        if (Date.now() > deadline) break;
        const step = startAgentStep("search", `Searching the web: ${shorten(query, 80)}`);
        try {
          const results = await webSearch(query, 6);
          mergeSources(sources, results, AGENT_MAX_SOURCES);
          // هماهنگی رتبه با ترتیب آرایه ادغام‌شده تا با ارجاع‌های [n] بخواند
          sources.forEach((s, i) => {
            s.rank = i + 1;
          });
          if (sources.length > 0) emit({ type: "sources", sources: [...sources] });
          step.done(`${results.length} results`);
        } catch {
          step.done("search unavailable");
        }
      }

      // --- گام ۳: خواندن صفحه‌ها (حداکثر ۳، میزبان‌های متنوع) ---
      const alreadyRead = new Set<string>();
      const picked = pickPagesToRead(sources, AGENT_MAX_READS, alreadyRead);
      let pageContext = "";
      for (const src of picked) {
        if (Date.now() > deadline) break;
        const host = src.host_name || hostOf(src.url);
        const idx = sources.indexOf(src) + 1; // شماره همان منبع [n]
        const step = startAgentStep("read", `Reading ${host}`);
        try {
          const page = await pageReader(src.url);
          if (!page || !page.text) {
            step.done("unreadable");
            continue;
          }
          pageContext += `[S${idx}] ${src.name || page.title || host} — ${src.url}\n${page.text}\n\n`;
          step.done(shorten(page.text, 80));
        } catch {
          step.done("read failed");
        }
      }

      // --- ساخت بلوک زمینه سنتز (همان قالب حالت پژوهش + استخراج‌ها) ---
      if (sources.length === 0) {
        return `\n\n${AGENT_NO_RESULTS_NOTE}`;
      }
      let contextBlock =
        `\n\nنتایج جست‌وجوی وب (برای ارجاع‌دهی با شماره [n] استفاده کن):\n${sources
          .map(
            (s, i) =>
              `[${i + 1}] ${s.name} — ${s.host_name}\nخلاصه: ${s.snippet}\nURL: ${s.url}`
          )
          .join("\n\n")}`;
      if (pageContext) {
        contextBlock += `\n\nمتن صفحه‌های خوانده‌شده از وب (برچسب [S<n>] با منبع [n] یکی است):\n${pageContext.trim()}`;
      }
      return contextBlock;
    };

    try {
      if (hasImages) {
        // بینایی: glm-4.6v با تصاویر به‌صورت data URL
        const imageItems = userAttachments
          .filter((a) => attachmentKind(a.type) === "image")
          .map((a) => {
            const buf = readUploadFile(a.url);
            if (!buf) return null;
            return {
              type: "image_url" as const,
              image_url: { url: `data:${a.type};base64,${buf.toString("base64")}` },
            };
          })
          .filter(Boolean) as Array<{ type: "image_url"; image_url: { url: string } }>;

        const visionMessages: Array<{
          role: "system" | "user" | "assistant";
          content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
        }> = [
          { role: "system", content: systemPrompt },
          ...historyMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  (userContent || "این تصویر را بررسی و توضیح بده.") +
                  (attachmentContext ? `\n\n${attachmentContext}` : "") +
                  researchContext,
              },
              ...imageItems,
            ],
          },
        ];

        const stream = await completeVisionStream(visionMessages);
        if (!stream) throw new Error("درگاه بینایی پاسخ جریانی برنگرداند");
        for await (const chunk of parseSdkStream(stream)) {
          if (signal.aborted) break;
          if (chunk.kind === "content") pushDelta(chunk.text);
          else if (chunk.kind === "reasoning") {
            thinkingContent += chunk.text;
            emit({ type: "thinking", text: chunk.text });
          } else if (chunk.kind === "finish" && chunk.servedModel) servedModel = chunk.servedModel;
        }
      } else {
        // زبانی: GLM با بودجه زمینه — و حلقه عامل برای حالت ایجنت
        const isAgent = mode === "agent" && !!userContent;

        let agentContext = "";
        let synthStep: { done: (summary?: string) => void } | null = null;
        if (isAgent) {
          agentContext = await runAgentResearch();
          // گام سنتز درست پیش از پاسخ جریانی نهایی
          synthStep = startAgentStep("synthesize", "Synthesizing the answer");
        }

        const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt + researchContext + agentContext },
          ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const last = llmMessages[llmMessages.length - 1];
        if (attachmentContext) {
          last.content = `${last.content}\n\n${attachmentContext}`;
        }

        const consumeStream = async (
          messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
          thinking: boolean
        ) => {
          const stream = await completeStream(messages, { thinking });
          if (!stream) throw new Error("درگاه زبانی پاسخ جریانی برنگرداند");
          for await (const chunk of parseSdkStream(stream)) {
            if (signal.aborted) break;
            if (chunk.kind === "content") pushDelta(chunk.text);
            else if (chunk.kind === "reasoning") {
              thinkingContent += chunk.text;
              emit({ type: "thinking", text: chunk.text });
            } else if (chunk.kind === "finish" && chunk.servedModel) servedModel = chunk.servedModel;
          }
        };

        const contentBeforeSynth = assistantContent.length;
        try {
          await consumeStream(llmMessages, mode === "reasoning");
        } catch (err) {
          if (isAgent && assistantContent.length === contentBeforeSynth && !signal.aborted) {
            // عامل همیشه پاسخ نهایی می‌دهد: بازگشت به دانش داخلی با یادداشت صادقانه
            console.warn("[chat] agent synthesis failed; falling back to internal knowledge:", err);
            const fallbackMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
              {
                role: "system",
                content:
                  buildSystemPrompt({
                    mode: "general",
                    memories: memories.map((m) => m.content),
                    systemInstruction: dbConversation?.systemInstruction,
                  }) + AGENT_FALLBACK_NOTE,
              },
              ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
            ];
            const fallbackLast = fallbackMessages[fallbackMessages.length - 1];
            if (attachmentContext) {
              fallbackLast.content = `${fallbackLast.content}\n\n${attachmentContext}`;
            }
            await consumeStream(fallbackMessages, false);
          } else {
            throw err;
          }
        } finally {
          if (synthStep && !signal.aborted) synthStep.done();
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته در تولید پاسخ";
      if (!assistantContent) {
        emit({ type: "error", message: `خطا در پردازش درخواست: ${mapUpstreamError(msg)}` });
      }
    }

    // ---------- نگهبان زبان و ذخیره ----------
    const lang = detectLanguage(userContent || transcribedAudio || "fa");
    const langWarning = detectUnexpectedCjk(assistantContent, lang === "fa" ? "fa" : lang === "en" ? "en" : "fa");

    // گام‌های عامل با قالب xenon-steps-v1 در ستون thinking ذخیره می‌شوند
    let thinkingPayload: string | null = thinkingContent || null;
    if (!thinkingPayload && agentSteps.length > 0) {
      const stepsPayload: AgentStepsPayload = {
        format: "xenon-steps-v1",
        steps: agentSteps.map((s) => {
          const rec: AgentStepRecord = { id: s.id, kind: s.kind, title: s.title };
          if (s.summary !== undefined) rec.summary = s.summary;
          return rec;
        }),
      };
      thinkingPayload = JSON.stringify(stepsPayload);
    }

    await db.message.update({
      where: { id: assistantMessage.id },
      data: {
        content: assistantContent,
        thinking: thinkingPayload,
        servedModel: servedModel ?? null,
        sources: sources.length ? JSON.stringify(sources) : null,
        langWarning,
      },
    });

    await db.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    db.usageEvent.create({ data: { kind: hasImages ? "vision" : "chat", detail: mode } })
      .catch(() => undefined);

    emit({ type: "done", messageId: assistantMessage.id, servedModel, langWarning });

    // ---------- ۹) عنوان خودکار برای گفتگوی تازه ----------
    const needsTitle = !dbConversation?.title || dbConversation.title === "گفتگوی جدید";
    if (needsTitle && firstUserMessage) {
      try {
        const { content: title } = await complete(
          [
            { role: "system", content: TITLE_PROMPT },
            {
              role: "user",
              content: `پیام کاربر: «${firstUserMessage.content.slice(0, 300)}»`,
            },
          ],
          { thinking: false }
        );
        const clean = title.replace(/["«»'`.]/g, "").trim().slice(0, 60);
        if (clean) {
          await db.conversation.update({
            where: { id: conversation.id },
            data: { title: clean },
          });
          emit({ type: "title", title: clean });
        }
      } catch (err) {
        console.error("[chat] title generation failed:", err);
        // عنوان غیرحیاتی است
      }
    }
  }, req.signal);
}
