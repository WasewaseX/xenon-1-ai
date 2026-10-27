// Xenon 1 AI — Long-Term Memory Maintenance (server-only)
// حافظهٔ بلندمدت: خلاصهٔ روان گفتگو برای عبور از بودجهٔ زمینه مدل
//
// Engineering note: GLM context is finite (MAX_CONTEXT_MESSAGES). Older turns
// are compressed into a rolling summary stored on Conversation.summary and
// injected into the system prompt on later turns, so long conversations stay
// coherent without exceeding the model's context limits.

import { db } from "@/lib/db";
import { complete } from "./llm";
import { ROLLING_SUMMARY_PROMPT } from "./prompts";

/** آستانهٔ شروع خلاصه‌سازی: وقتی پیام‌ها از بودجهٔ زمینه گذشتند */
export const SUMMARY_THRESHOLD_MESSAGES = 24;

/**
 * به‌روزرسانی خلاصهٔ روان گفتگو (fire-and-forget از فراخوان).
 * خلاصهٔ قبلی + رونوشت اخیر → خلاصهٔ تازه؛ در هر خطا بی‌صدا رد می‌شود
 * (حافظهٔ کمکی هرگز نباید جریان پاسخ را بشکند).
 */
export async function updateRollingSummary(conversationId: string): Promise<void> {
  try {
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { summary: true },
    });
    if (!conv) return;

    const msgs = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    if (msgs.length < SUMMARY_THRESHOLD_MESSAGES) return;
    msgs.reverse();

    const transcript = msgs
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
      .join("\n")
      .slice(0, 12_000);

    const { content } = await complete(
      [
        { role: "system", content: ROLLING_SUMMARY_PROMPT },
        {
          role: "user",
          content:
            (conv.summary ? `Previous summary (update it, keep what is still relevant):\n${conv.summary}\n\n` : "") +
            `Recent transcript:\n${transcript}`,
        },
      ],
      { thinking: false }
    );

    const clean = content.trim().slice(0, 2_000);
    if (clean) {
      await db.conversation.update({
        where: { id: conversationId },
        data: { summary: clean },
      });
    }
  } catch (err) {
    console.warn("[memory] rolling summary update failed (non-fatal):", err);
  }
}
