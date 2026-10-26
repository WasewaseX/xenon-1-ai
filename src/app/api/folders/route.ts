// Xenon 1 AI — Folders API
// پوشه‌های گفتگو

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const folders = await db.folder.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json(
    folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      createdAt: f.createdAt.toISOString(),
    }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) {
    return Response.json({ error: "نام پوشه الزامی است" }, { status: 400 });
  }
  const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#8b5cf6";

  const folder = await db.folder.create({ data: { name, color } });
  return Response.json({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    createdAt: folder.createdAt.toISOString(),
  });
}
