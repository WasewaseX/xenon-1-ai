"use client";

// زنون ۱ — ناحیه گفتگو: فهرست پیام‌ها، اسکلت بارگذاری و اسکرول هوشمند
// (صفحهٔ خوش‌آمد به welcome-screen.tsx منتقل شد — نوشتار اول، سبک Cursor)

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";
import { MessageItem } from "./message-item";

function MessagesSkeleton() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6" aria-label={t("a11y.loadingMessages")}>
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
  const t = useT();
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

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="xenon-scroll h-full overflow-y-auto">
        {loadingMessages ? (
          <MessagesSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">{t("chat.emptyConversation")}</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
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
      {!nearBottom && messages.length > 0 ? (
        <Button
          size="icon"
          aria-label={t("a11y.scrollToBottom")}
          className="absolute bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border border-border/60 shadow-lg"
          onClick={() => scrollToBottom(true)}
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
