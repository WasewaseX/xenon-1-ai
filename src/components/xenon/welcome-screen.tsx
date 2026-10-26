"use client";

// زنون ۱ — صفحهٔ خوش‌آمد به سبک Cursor: لوگوی کوچک، عنوان فشرده و سپس نوشتار (اول نوشتار!)
// با چیپ‌های پیشنهاد کوچک به‌صورت ردیف flex-wrap. همه‌چیز در ۳۹۰px بدون اسکرول افقی جا می‌شود.

import { motion } from "framer-motion";
import { Brain, Code2, ImageIcon, Telescope, type LucideIcon } from "lucide-react";
import { useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";
import { Composer } from "./composer";

interface Suggestion {
  icon: LucideIcon;
  labelKey: "suggestion.reasoningLabel" | "suggestion.codingLabel" | "suggestion.researchLabel" | "suggestion.imageLabel";
  promptKey: "suggestion.reasoningPrompt" | "suggestion.codingPrompt" | "suggestion.researchPrompt" | "suggestion.imagePrompt";
  action: "reasoning" | "coding" | "research" | "image";
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Brain,
    labelKey: "suggestion.reasoningLabel",
    promptKey: "suggestion.reasoningPrompt",
    action: "reasoning",
  },
  {
    icon: Code2,
    labelKey: "suggestion.codingLabel",
    promptKey: "suggestion.codingPrompt",
    action: "coding",
  },
  {
    icon: Telescope,
    labelKey: "suggestion.researchLabel",
    promptKey: "suggestion.researchPrompt",
    action: "research",
  },
  {
    icon: ImageIcon,
    labelKey: "suggestion.imageLabel",
    promptKey: "suggestion.imagePrompt",
    action: "image",
  },
];

export function WelcomeScreen() {
  const t = useT();
  const setMode = useXenon((s) => s.setMode);
  const toggleImageGen = useXenon((s) => s.toggleImageGen);
  const sendMessage = useXenon((s) => s.sendMessage);

  const runSuggestion = (s: Suggestion) => {
    switch (s.action) {
      case "reasoning":
        setMode("reasoning");
        break;
      case "coding":
        setMode("coding");
        break;
      case "research":
        setMode("research");
        break;
      case "image":
        setMode("general");
        toggleImageGen(true);
        break;
    }
    sendMessage(t(s.promptKey)).catch(() => undefined);
  };

  return (
    <div className="xenon-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        aria-label={t("a11y.welcome")}
        className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-8 text-center"
      >
        <img src="/xenon-icon.svg" alt={t("a11y.xenonIcon")} className="h-11 w-11" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Xenon 1</h1>
        <p className="mt-1.5 text-center text-sm leading-6 text-muted-foreground">{t("welcome.tagline")}</p>

        {/* نوشتار اول — مرکز صفحه مثل Cursor/Z.ai */}
        <div className="mt-6 w-full">
          <Composer embedded />
        </div>

        {/* چیپ‌های پیشنهاد: دکمه‌های شبح کوچک */}
        <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.action}
              type="button"
              title={t(s.promptKey)}
              aria-label={t("a11y.suggestion", { prompt: t(s.promptKey) })}
              onClick={() => runSuggestion(s)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <s.icon className="h-3.5 w-3.5 text-primary/80" aria-hidden />
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-[0.7rem] text-muted-foreground/70">{t("welcome.disclaimer")}</p>
      </motion.section>
    </div>
  );
}
