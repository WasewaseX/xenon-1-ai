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
} from "@/lib/xenon/llm";
import { sseStream } from "@/lib/xenon/sse";
import { buildSystemPrompt, TITLE_PROMPT } from "@/lib/xenon/prompts";
import { detectUnexpectedCjk, detectLanguage, sanitizeOutput, mapUpstreamError } from "@/lib/xenon/language-guard";
import { MAX_ATTACHMENT_TEXT, MAX_CONTEXT_MESSAGES } from "@/lib/xenon/models";
import type { AttachmentMeta, ChatMode, ResearchSource } from "@/lib/xenon/types";
import { existsSync, readFileSync } from "fs";
import path from "path";

export const maxDuration = 300;

const UPLOAD_DIR = path.join(process.cwd(), "upload");
const VALID_MODES: ChatMode[] = ["general", "reasoning", "coding", "research"];

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
      emit({ type: "error", message: "گفتگوی موردنظر یافت نشد" });
      return;
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
        // زبانی: GLM با بودجه زمینه
        const llmMessages = [
          { role: "system" as const, content: systemPrompt + researchContext },
          ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const last = llmMessages[llmMessages.length - 1];
        if (attachmentContext) {
          last.content = `${last.content}\n\n${attachmentContext}`;
        }

        const stream = await completeStream(llmMessages, { thinking: mode === "reasoning" });
        if (!stream) throw new Error("درگاه زبانی پاسخ جریانی برنگرداند");
        for await (const chunk of parseSdkStream(stream)) {
          if (signal.aborted) break;
          if (chunk.kind === "content") pushDelta(chunk.text);
          else if (chunk.kind === "reasoning") {
            thinkingContent += chunk.text;
            emit({ type: "thinking", text: chunk.text });
          } else if (chunk.kind === "finish" && chunk.servedModel) servedModel = chunk.servedModel;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته در تولید پاسخ";
      if (!assistantContent) {
        emit({ type: "error", message: `خطا در پردازش درخواست: ${mapUpstreamError(msg)}` });
      }
    }

    // ---------- ۸) نگهبان زبان و ذخیره ----------
    const lang = detectLanguage(userContent || transcribedAudio || "fa");
    const langWarning = detectUnexpectedCjk(assistantContent, lang === "fa" ? "fa" : lang === "en" ? "en" : "fa");

    await db.message.update({
      where: { id: assistantMessage.id },
      data: {
        content: assistantContent,
        thinking: thinkingContent || null,
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
