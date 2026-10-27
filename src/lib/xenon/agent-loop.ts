// Xenon 1 AI — Autonomous Agent Loop (server-only)
// حلقهٔ اجرای خودکار با فراخوانی ابزار واقعی GLM:
// مدل ابزار را انتخاب می‌کند → ابزار واقعاً اجرا می‌شود → نتیجهٔ واقعی به مدل
// برمی‌گردد → مدل تصمیم بعدی را می‌گیرد (خطاها هم به مدل برمی‌گردند تا خودش
// بازیابی کند) — تا پاسخ نهایی یا اتمام بودجهٔ گام/زمان.
//
// Engineering notes:
// - Intelligence comes ONLY from the Z.ai GLM gateway (function calling).
//   Tools are pure execution infrastructure — no other LLM provider.
// - Adaptive: step-1 call enables thinking only for requests that look complex;
//   simple requests take the fast path (model answers without tools).
// - Every tool call is logged as a UsageEvent (kind "tool") for measurability.
// - If the gateway rejects the tools parameter entirely, ToolsUnsupportedError
//   is thrown BEFORE any step event is emitted, so the caller can fall back to
//   the legacy scripted research flow with zero UI artifacts.

import { db } from "@/lib/db";
import {
  completeWithTools,
  ToolsUnsupportedError,
  type ToolLoopMessage,
} from "./llm";
import { AGENT_TOOLS, runTool, type ToolRunContext } from "./tools";
import { AGENT_TOOL_PROMPT } from "./prompts";
import type { AgentStepKind, AgentStepRecord, ResearchSource, StreamEvent } from "./types";

export { ToolsUnsupportedError };

const AGENT_MAX_STEPS = 10;
const DEFAULT_TIME_BUDGET_MS = 240_000;
const FINAL_NUDGE = "Time budget reached. Write your final answer NOW based on what you have gathered. Do not call any more tools.";

/** نگاشت ابزار → نوع گام برای تایم‌لاین فعالیت */
const TOOL_KIND: Record<string, AgentStepKind> = {
  web_search: "search",
  web_fetch: "read",
  github_read: "github",
  github_write: "github",
  read_file: "file",
  write_file: "file",
  list_files: "file",
  run_command: "terminal",
  memory_search: "memory",
  memory_save: "memory",
};

/** تیتر خوانا برای گام فعالیت، بر اساس نام ابزار و آرگومان‌ها */
function toolTitle(name: string, args: Record<string, unknown>): string {
  const s = (v: unknown, max = 60) => {
    const t = String(v ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };
  switch (name) {
    case "web_search":
      return `Searching the web: ${s(args.query, 48)}`;
    case "web_fetch":
      return `Reading ${s(args.url, 60)}`;
    case "github_read":
      return `GitHub cloud: reading ${s(args.repo, 48)}`;
    case "github_write":
      return `GitHub cloud: committing ${s(args.path, 48)}`;
    case "read_file":
      return `Reading file ${s(args.path, 48)}`;
    case "write_file":
      return `Writing file ${s(args.path, 48)}`;
    case "list_files":
      return `Listing ${s(args.path, 48) || "workspace"}`;
    case "run_command":
      return `Running: ${s(args.command, 64)}`;
    case "memory_search":
      return `Searching memory: ${s(args.query, 48)}`;
    case "memory_save":
      return `Saving memory: ${s(args.content, 48)}`;
    default:
      return `Tool call: ${name}`;
  }
}

/** تشخیص تقریبی پیچیدگی درخواست برای فعال‌سازی تطبیقی thinking در فراخوان اول */
function looksComplex(content: string): boolean {
  if (content.length > 160) return true;
  return /(build|implement|create|write|fix|debug|refactor|analy[sz]e|research|design|migrate|deploy|compare|investigate|بساز|پیاده‌سازی|پیاده سازی|بنویس|اشکال|تحلیل|پژوهش|طراحی|مقایسه|بررسی)/i.test(
    content
  );
}

/** خلاصهٔ کوتاه از خروجی ابزار برای نمایش در تایم‌لاین */
function outputSummary(output: string, ok: boolean): string {
  const clean = output.replace(/\s+/g, " ").trim();
  const prefix = ok ? "" : "✗ ";
  return `${prefix}${clean.slice(0, 96)}${clean.length > 96 ? "…" : ""}`;
}

export interface AgentLoopParams {
  /** دستور سیستمی کامل (هویت + سیاست زبان + حالت agent) — حلقه پروتکل ابزار را اضافه می‌کند */
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userContent: string;
  attachmentContext?: string;
  emit: (event: StreamEvent) => void;
  signal: AbortSignal;
  timeBudgetMs?: number;
  /** هر بار که منابع تغییر کرد کل فهرست را می‌دهد (برای رخداد sources) */
  onSources?: (sources: ResearchSource[]) => void;
  /** استریم زنجیرهٔ استدلال در صورت فعال بودن thinking */
  onThinking?: (text: string) => void;
}

export interface AgentLoopResult {
  content: string;
  steps: AgentStepRecord[];
  sources: ResearchSource[];
  servedModel?: string;
  toolCallCount: number;
  usedTools: string[];
  thinkingUsed: boolean;
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const deadline = Date.now() + (params.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const sources: ResearchSource[] = [];
  const steps: AgentStepRecord[] = [];
  const usedTools = new Set<string>();
  let stepCounter = 0;
  let toolCallCount = 0;
  let servedModel: string | undefined;
  let thinkingUsed = false;

  const ctx: ToolRunContext = {
    sources,
    onSourcesChanged: (all) => {
      params.onSources?.(all);
    },
  };

  const messages: ToolLoopMessage[] = [
    { role: "system", content: `${params.systemPrompt}\n\n${AGENT_TOOL_PROMPT}` },
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: params.attachmentContext
        ? `${params.userContent}\n\n${params.attachmentContext}`
        : params.userContent,
    },
  ];

  const useThinking = looksComplex(params.userContent);

  for (let round = 1; round <= AGENT_MAX_STEPS; round++) {
    if (params.signal.aborted) break;

    const isLast = round === AGENT_MAX_STEPS;
    const budgetExhausted = Date.now() > deadline;
    const res = await completeWithTools(messages, {
      tools: AGENT_TOOLS,
      toolChoice: isLast || budgetExhausted ? "none" : "auto",
      thinking: round === 1 && useThinking,
    });

    if (res.servedModel) servedModel = res.servedModel;
    if (res.reasoning) {
      thinkingUsed = true;
      params.onThinking?.(res.reasoning);
    }

    // پاسخ نهایی بدون فراخوان ابزار — پایان حلقه
    const content = res.content.trim();
    if (res.toolCalls.length === 0 || isLast || budgetExhausted) {
      if (content) {
        return {
          content,
          steps,
          sources,
          servedModel,
          toolCallCount,
          usedTools: [...usedTools],
          thinkingUsed,
        };
      }
      if (isLast || budgetExhausted) {
        // مدل با وجود ممنوعیت ابزار چیزی نداد — یک فراخوان نهایی بدون ابزار
        const forced = await completeWithTools(
          [...messages, { role: "user", content: FINAL_NUDGE }],
          { toolChoice: "none", thinking: false }
        );
        if (forced.servedModel) servedModel = forced.servedModel ?? servedModel;
        if (forced.reasoning) params.onThinking?.(forced.reasoning);
        return {
          content: forced.content.trim(),
          steps,
          sources,
          servedModel: forced.servedModel ?? servedModel,
          toolCallCount,
          usedTools: [...usedTools],
          thinkingUsed,
        };
      }
      // محتوای خالی در میانهٔ حلقه — به مدل فشار بیاور
      messages.push({
        role: "user",
        content: "(Your previous response was empty. Either call a tool or write your final answer.)",
      });
      continue;
    }

    // پیام دستیار همراه با درخواست‌های ابزار به تاریخچهٔ حلقه اضافه می‌شود
    messages.push({
      role: "assistant",
      content: res.content || "",
      tool_calls: res.rawToolCalls,
    });

    for (const call of res.toolCalls) {
      if (params.signal.aborted) break;
      const kind = TOOL_KIND[call.name] ?? "plan";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        // تجزیه ناموفق — runTool خودش پیام خطای JSON نامعتبر برمی‌گرداند
      }
      const id = `t${++stepCounter}`;
      const title = toolTitle(call.name, args);
      steps.push({ id, kind, title });
      params.emit({ type: "step", id, kind, title, state: "start" });

      const t0 = Date.now();
      const result = await runTool(call.name, call.arguments, ctx);
      const ms = Date.now() - t0;
      toolCallCount += 1;
      usedTools.add(call.name);

      const summary = outputSummary(result.output, result.ok);
      steps.find((s) => s.id === id)!.summary = summary;
      params.emit({ type: "step", id, kind, title, state: "done", summary });

      // اندازه‌پذیری: هر فراخوان ابزار یک رویداد مصرف ثبت می‌کند
      db.usageEvent
        .create({ data: { kind: "tool", detail: `${call.name} ${result.ok ? "ok" : "fail"} ${ms}ms` } })
        .catch(() => undefined);

      // نتیجهٔ واقعی (حتی خطا) به مدل برمی‌گردد تا خودش بازیابی کند
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.output,
      });
    }

    if (Date.now() > deadline && !params.signal.aborted) {
      messages.push({ role: "user", content: FINAL_NUDGE });
      const forced = await completeWithTools(messages, { toolChoice: "none", thinking: false });
      if (forced.servedModel) servedModel = forced.servedModel;
      if (forced.reasoning) params.onThinking?.(forced.reasoning);
      return {
        content: forced.content.trim(),
        steps,
        sources,
        servedModel: forced.servedModel ?? servedModel,
        toolCallCount,
        usedTools: [...usedTools],
        thinkingUsed,
      };
    }
  }

  // تئوری unreachable (حلقه در هر دور یا برمی‌گردد یا abort می‌شود) — محافظ نهایی:
  return {
    content: "",
    steps,
    sources,
    servedModel,
    toolCallCount,
    usedTools: [...usedTools],
    thinkingUsed,
  };
}
