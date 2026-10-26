// Xenon 1 AI — Single Folder API
// تغییر نام و حذف پوشه (گفتگوها بدون پوشه می‌شوند)

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "چیزی برای به‌روزرسانی نیست" }, { status: 400 });
  }

  try {
    const folder = await db.folder.update({ where: { id }, data });
    return Response.json({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      createdAt: folder.createdAt.toISOString(),
    });
  } catch {
    return Response.json({ error: "پوشه یافت نشد" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await db.folder.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "پوشه یافت نشد" }, { status: 404 });
  }
}
