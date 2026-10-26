"use client";

// زنون ۱ — خط زمانی «فعالیت عامل»: گام‌های برنامه‌ریزی/جست‌وجو/خواندن/تولید
// هم گام‌های زندهٔ جریان (message.steps) و هم گام‌های ذخیره‌شدهٔ thinking (xenon-steps-v1)
// را نمایش می‌دهد؛ در حین اجرا باز و پس از پایان جمع‌شده است.

import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Github,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { formatNumber } from "@/lib/xenon/i18n";
import type { TranslationKey } from "@/lib/xenon/i18n";
import type { AgentStep } from "@/lib/xenon/steps";

const KIND_ICON: Record<string, LucideIcon> = {
  plan: ListChecks,
  search: Search,
  read: BookOpen,
  github: Github,
  synthesize: Sparkles,
};

const KIND_LABEL_KEY: Record<string, TranslationKey> = {
  plan: "agent.step.plan",
  search: "agent.step.search",
  read: "agent.step.read",
  github: "agent.step.github",
  synthesize: "agent.step.synthesize",
};

function StepRow({ step }: { step: AgentStep }) {
  const t = useT();
  const done = step.state === "done";
  const Icon = KIND_ICON[step.kind] ?? Sparkles;
  const labelKey = KIND_LABEL_KEY[step.kind];
  const detail = done ? step.summary || step.title : step.title;

  return (
    <li className="flex items-start gap-2 py-1">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-border/60 bg-background/60",
          done ? "text-muted-foreground" : "text-primary"
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-5 text-foreground/90">{labelKey ? t(labelKey) : step.title}</p>
        {detail ? (
          <p className="xenon-mono truncate leading-4 text-muted-foreground" dir="auto" title={detail}>
            {detail}
          </p>
        ) : null}
      </div>
      {done ? (
        <Check className="mt-1.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      ) : (
        <Loader2 className="mt-1.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary/70" aria-hidden />
      )}
    </li>
  );
}

interface AgentActivityProps {
  steps: AgentStep[];
}

export function AgentActivity({ steps }: AgentActivityProps) {
  const t = useT();
  const locale = useLocale();
  const running = steps.some((step) => step.state === "start");

  // حین اجرا باز؛ پس از پایان به‌صورت پیش‌فرض جمع می‌شود (انتخاب کاربر تا پایان حفظ می‌شود)
  const [open, setOpen] = useState(running);
  const [prevRunning, setPrevRunning] = useState(running);
  if (prevRunning !== running) {
    setPrevRunning(running);
    if (!running) setOpen(false);
  }

  if (steps.length === 0) return null;

  const doneCount = steps.filter((step) => step.state === "done").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2.5">
      <CollapsibleTrigger
        aria-label={open ? t("agent.hideActivity") : t("agent.showActivity")}
        className="group/act inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
        ) : (
          <Workflow className="h-3.5 w-3.5 text-primary/80" aria-hidden />
        )}
        <span className="truncate">{t("agent.activity")}</span>
        <span className="xenon-mono shrink-0 tabular-nums text-muted-foreground/70" dir="ltr">
          {formatNumber(doneCount, locale)}/{formatNumber(steps.length, locale)}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]/act:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="xenon-scroll mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-card/40 px-2.5 py-1">
          <ul className="space-y-0.5">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
