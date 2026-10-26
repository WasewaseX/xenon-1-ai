"use client";

// زنون ۱ — ناحیه گفتگو: صفحه خوش‌آمد، فهرست پیام‌ها و اسکرول هوشمند

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Brain, Code2, ImageIcon, Sparkles, Telescope, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useXenon } from "@/lib/xenon/store";
import { MessageItem } from "./message-item";

interface Suggestion {
  icon: LucideIcon;
  modeLabel: string;
  prompt: string;
  action: "reasoning" | "coding" | "research" | "image";
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Brain,
    modeLabel: "استدلال",
    prompt: "اثبات اینکه ریشه ۲ عدد گنگ است را گام‌به‌گام توضیح بده",
    action: "reasoning",
  },
  {
    icon: Code2,
    modeLabel: "برنامه‌نویسی",
    prompt: "یک هوک React برای جلوگیری از درخواست‌های تکراری (debounce) بنویس",
    action: "coding",
  },
  {
    icon: Telescope,
    modeLabel: "پژوهش",
    prompt: "جدیدترین مدل‌های زبانی متن‌باز را با منابع بررسی کن",
    action: "research",
  },
  {
    icon: ImageIcon,
    modeLabel: "تصویرساز",
    prompt: "پوستری رنگارنگ برای رویداد هوش مصنوعی در تهران تصور و توصیف کن",
    action: "image",
  },
];

function WelcomeHero() {
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
    sendMessage(s.prompt).catch(() => undefined);
  };

  return (
    <section aria-label="خوش‌آمدگویی" className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-8">
      <img src="/xenon-icon.svg" alt="آیکون زنون ۱" className="mb-5 h-20 w-20 drop-shadow-[0_0_24px_rgba(139,92,246,0.35)]" />
      <h1 className="bg-gradient-to-l from-primary via-fuchsia-500 to-primary bg-clip-text text-4xl font-extrabold text-transparent">
        زنون ۱
      </h1>
      <p className="mt-3 text-center text-sm leading-7 text-muted-foreground sm:text-base">
        دستیار هوشمند فارسی برای استدلال، کدنویسی، پژوهش و خلاقیت
      </p>
      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUGGESTIONS.map((s) => (
          <Card
            key={s.prompt}
            role="button"
            tabIndex={0}
            aria-label={`پیشنهاد: ${s.prompt}`}
            onClick={() => runSuggestion(s)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                runSuggestion(s);
              }
            }}
            className="cursor-pointer border-border/70 p-0 transition-all hover:border-primary/50 hover:shadow-md focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <CardContent className="flex h-full flex-col gap-2.5 p-4">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-[0.7rem] font-medium text-muted-foreground">{s.modeLabel}</span>
              <span className="text-[0.82rem] leading-6">{s.prompt}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        زنون می‌تواند خطا کند؛ اطلاعات مهم را بررسی کنید.
      </p>
    </section>
  );
}

function MessagesSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" aria-label="در حال بارگذاری پیام‌ها">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className={`h-4 w-24 ${i % 2 === 0 ? "ms-auto" : ""}`} />
          <Skeleton className={`h-16 w-full rounded-2xl ${i % 2 === 0 ? "max-w-[85%] ms-auto" : ""}`} />
          <Skeleton className="h-10 w-3/4 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

export function ChatArea() {
  const activeId = useXenon((s) => s.activeId);
  const messages = useXenon((s) => s.messages);
  const loadingMessages = useXenon((s) => s.loadingMessages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [prevActiveId, setPrevActiveId] = useState(activeId);

  // الگوی توصیه‌شدهٔ ری‌اکت: تنظیم وضعیت در زمان رندر هنگام تغییر گفتگو
  if (prevActiveId !== activeId) {
    setPrevActiveId(activeId);
    setNearBottom(true);
  }

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setNearBottom(distance < 120);
  }, []);

  // هنگام تغییر گفتگو، به پایین برو
  useEffect(() => {
    scrollToBottom();
  }, [activeId, scrollToBottom]);

  // هنگام رسیدن محتوای تازه، اگر کاربر نزدیک پایین است دنبال کن
  useEffect(() => {
    if (nearBottom) scrollToBottom();
  }, [messages, nearBottom, scrollToBottom]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
  const showHero = !activeId && messages.length === 0 && !loadingMessages;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="xenon-scroll h-full overflow-y-auto">
        {loadingMessages ? (
          <MessagesSkeleton />
        ) : showHero ? (
          <WelcomeHero />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">این گفتگو خالی است؛ اولین پیام را بنویسید.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                isLastAssistant={message.id === lastAssistantId && message.role === "assistant"}
              />
            ))}
          </div>
        )}
      </div>
      {!nearBottom && !showHero ? (
        <Button
          size="icon"
          aria-label="رفتن به پایین"
          className="absolute bottom-4 left-1/2 h-10 w-10 -translate-x-1/2 rounded-full shadow-lg"
          onClick={() => scrollToBottom(true)}
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
