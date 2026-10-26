// Xenon 1 AI — Single Memory API
// حذف حافظه

import { NextRequest } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await db.memory.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "حافظه یافت نشد" }, { status: 404 });
  }
}
