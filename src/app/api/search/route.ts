// Xenon 1 AI — Web Search API
// جست‌وجوی وب برای حالت پژوهش

import { NextRequest } from "next/server";
import { webSearch } from "@/lib/xenon/llm";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 400) : "";
  if (!query) {
    return Response.json({ error: "عبارت جست‌وجو خالی است" }, { status: 400 });
  }

  try {
    const sources = await webSearch(query, 6);
    db.usageEvent.create({ data: { kind: "search" } }).catch(() => undefined);
    return Response.json({ sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    return Response.json({ error: `جست‌وجو ناموفق بود: ${message}` }, { status: 502 });
  }
}
