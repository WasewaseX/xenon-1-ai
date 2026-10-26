// Xenon 1 AI — Single Conversation API
// بازیابی با پیام‌ها، ویرایش (عنوان/پین/پوشه/حالت/دستور سیستمی)، حذف

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { AttachmentMeta, ChatMode, MessageDTO, ResearchSource, Role } from "@/lib/xenon/types";

type Params = { params: Promise<{ id: string }> };

function toMessageDTO(m: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  thinking: string | null;
  model: string | null;
  servedModel: string | null;
  attachments: string | null;
  sources: string | null;
  langWarning: boolean;
  createdAt: Date;
}): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role as Role,
    content: m.content,
    thinking: m.thinking,
    model: m.model,
    servedModel: m.servedModel,
    attachments: m.attachments ? (JSON.parse(m.attachments) as AttachmentMeta[]) : null,
    sources: m.sources ? (JSON.parse(m.sources) as ResearchSource[]) : null,
    langWarning: m.langWarning,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" as const } } },
  });
  if (!conversation) {
    return Response.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  }

  return Response.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      folderId: conversation.folderId,
      pinned: conversation.pinned,
      mode: conversation.mode as ChatMode,
      systemInstruction: conversation.systemInstruction,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: conversation.messages.length,
    },
    messages: conversation.messages.map(toMessageDTO),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 120) || "گفتگوی جدید";
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.mode === "string" && ["general", "reasoning", "coding", "research"].includes(body.mode))
    data.mode = body.mode;
  if (body.folderId === null || typeof body.folderId === "string") data.folderId = body.folderId;
  if (body.systemInstruction === null || typeof body.systemInstruction === "string")
    data.systemInstruction = typeof body.systemInstruction === "string" ? body.systemInstruction.slice(0, 2000) : null;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "چیزی برای به‌روزرسانی نیست" }, { status: 400 });
  }

  try {
    const updated = await db.conversation.update({ where: { id }, data });
    return Response.json({
      id: updated.id,
      title: updated.title,
      folderId: updated.folderId,
      pinned: updated.pinned,
      mode: updated.mode as ChatMode,
      systemInstruction: updated.systemInstruction,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    return Response.json({ error: "گفتگو یا پوشه یافت نشد" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await db.conversation.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  }
}
