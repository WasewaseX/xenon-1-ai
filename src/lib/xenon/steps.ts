// Xenon 1 AI — Agent Step Timeline (frontend structural types)
// انواع ساختاری سمت فرانت‌اند برای گام‌های «عامل» (agent).
//
// نکتهٔ قرارداد: types.ts و route.ts مالکیت عامل بک‌اند است و دست‌نخورده می‌ماند؛
// رخداد "step" روی جریان SSE و فیلد steps پیام را همین‌جا به‌صورت ساختاری تعریف می‌کنیم
// تا هم‌زمان با افزودن حالت "agent" به بک‌اند، رابط کاربری آماده باشد و بدون
// رخدادهای step هم هیچ چیز نشکند (progressive enhancement).

import type { MessageDTO } from "./types";

export type AgentStepKind = "plan" | "search" | "read" | "github" | "synthesize";
export type AgentStepState = "start" | "done";

/** یک گام از فعالیت عامل */
export interface AgentStep {
  id: string;
  kind: AgentStepKind;
  title: string;
  state: AgentStepState;
  summary?: string;
}

/** رخداد SSE برای گام‌های عامل — {"type":"step","id","kind","title","state","summary"?} */
export interface XenonStepEvent {
  type: "step";
  id: string;
  kind: AgentStepKind;
  title: string;
  state: AgentStepState;
  summary?: string;
}

/** پیام به‌همراه گام‌های زندهٔ عامل (فیلد اختیاریِ سمت کلاینت؛ types.ts دست‌نخورده می‌ماند) */
export interface MessageWithSteps extends MessageDTO {
  steps?: AgentStep[] | null;
}

/** نشانهٔ قالب ذخیره‌شدهٔ گام‌ها در ستون thinking پیام‌های عامل */
export const XENON_STEPS_FORMAT = "xenon-steps-v1";

interface PersistedStepsPayload {
  format?: string;
  steps?: unknown;
}

function isAgentStepKind(value: unknown): value is AgentStepKind {
  return (
    value === "plan" ||
    value === "search" ||
    value === "read" ||
    value === "github" ||
    value === "file" ||
    value === "terminal" ||
    value === "memory" ||
    value === "synthesize"
  );
}

function isAgentStep(value: unknown): value is AgentStep {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  // نکتهٔ قرارداد: گام‌های ذخیره‌شده فیلد state ندارند (همه انجام‌شده‌اند)؛
  // فقط گام‌های زندهٔ جریان state می‌فرستند. پس state اختیاری است.
  const state = candidate.state;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    isAgentStepKind(candidate.kind) &&
    (state === undefined || state === "start" || state === "done") &&
    (candidate.summary === undefined || typeof candidate.summary === "string")
  );
}

/**
 * خواندن گام‌های عامل از ستون thinking پیام ذخیره‌شده.
 * - اگر thinking با قالب xenon-steps-v1 بود → فهرست گام‌ها (ممکن است خالی باشد).
 * - اگر متن ساده بود (زنجیرهٔ استدلال قدیمی) یا JSON ناقص → null.
 */
export function parsePersistedSteps(thinking: string | null | undefined): AgentStep[] | null {
  if (!thinking) return null;
  try {
    const parsed = JSON.parse(thinking) as PersistedStepsPayload;
    if (parsed?.format !== XENON_STEPS_FORMAT || !Array.isArray(parsed.steps)) return null;
    // گام‌های ذخیره‌شده همیشه «انجام‌شده» بازسازی می‌شوند (timeline پس از reload)
    return parsed.steps.filter(isAgentStep).map((step) => ({ ...step, state: step.state ?? "done" }));
  } catch {
    return null;
  }
}
