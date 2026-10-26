// Xenon 1 AI — Memories API
// حافظه پایدار با تأیید کاربر

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

const CATEGORIES = ["preference", "fact", "project", "general"];

export async function GET() {
  const memories = await db.memory.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json(
    memories.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 500) : "";
  if (!content) {
    return Response.json({ error: "محتوای حافظه خالی است" }, { status: 400 });
  }
  const category = CATEGORIES.includes(body.category) ? body.category : "general";

  const memory = await db.memory.create({ data: { content, category } });
  return Response.json({
    id: memory.id,
    content: memory.content,
    category: memory.category,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  });
}
