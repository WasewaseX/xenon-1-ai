// Xenon 1 AI — Conversations API
// فهرست و ساخت گفتگوها

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import type { ChatMode } from "@/lib/xenon/types";

export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { messages: true } } },
  });

  return Response.json(
    conversations.map((c) => ({
      id: c.id,
      title: c.title,
      folderId: c.folderId,
      pinned: c.pinned,
      mode: c.mode as ChatMode,
      systemInstruction: c.systemInstruction,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: c._count.messages,
    }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "general";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "گفتگوی جدید";

  const conversation = await db.conversation.create({
    data: { title, mode },
    include: { _count: { select: { messages: true } } },
  });

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    folderId: conversation.folderId,
    pinned: conversation.pinned,
    mode: conversation.mode as ChatMode,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count.messages,
  });
}
