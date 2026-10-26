// Xenon 1 AI — Stats API
// آمار استفاده و مشاهده‌پذیری

import { db } from "@/lib/db";

export async function GET() {
  const [conversations, messages, memories, usageEvents] = await Promise.all([
    db.conversation.count(),
    db.message.count(),
    db.memory.count(),
    db.usageEvent.groupBy({ by: ["kind"], _count: { _all: true } }),
  ]);

  const byKind: Record<string, number> = {};
  for (const g of usageEvents) {
    byKind[g.kind] = g._count._all;
  }

  return Response.json({ conversations, messages, memories, byKind });
}
