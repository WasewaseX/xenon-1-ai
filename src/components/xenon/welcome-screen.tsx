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
    <div className="xenon-scroll xenon-glow flex min-h-0 flex-1 flex-col overflow-y-auto">
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        aria-label={t("a11y.welcome")}
        className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-4 py-8 text-center"
      >
        <img src="/xenon-icon.svg" alt={t("a11y.xenonIcon")} className="h-11 w-11 drop-shadow-[0_0_18px_oklch(0.62_0.21_295/0.35)]" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">Xenon 1</h1>
        <p className="mt-1.5 text-center text-sm leading-6 text-muted-foreground">{t("welcome.tagline")}</p>

        {/* نوشتار اول — مرکز صفحه مثل Cursor/Z.ai */}
        <div className="mt-6 w-full">
          <Composer embedded />
        </div>

        {/* Z.ai-style suggestion cards: 2-col grid on sm+, single column on phones */}
        <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.action}
              type="button"
              title={t(s.promptKey)}
              aria-label={t("a11y.suggestion", { prompt: t(s.promptKey) })}
              onClick={() => runSuggestion(s)}
              className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 text-start transition-all hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]"
            >
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/70 text-primary/80 transition-colors group-hover:border-primary/40 group-hover:text-primary"
                aria-hidden
              >
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground/90">
                  {t(s.labelKey)}
                </span>
                <span className="mt-0.5 line-clamp-1 block text-[0.7rem] leading-4 text-muted-foreground">
                  {t(s.promptKey)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-[0.7rem] text-muted-foreground/70">{t("welcome.disclaimer")}</p>
      </motion.section>
    </div>
  );
}
