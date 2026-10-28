"use client";

// زنون ۱ — نمایش یک پیام (کاربر یا دستیار)
// دستیار: نثر آزاد بدون جعبه (سبک Cursor/Z.ai) با آواتار ۲۰px، فعالیت عامل،
// منابع و نوار اقدامات فشرده. کاربر: حباب فشردهٔ rounded-xl با ms-auto (منطقی/RTL).

import { useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  BookmarkPlus,
  Brain,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/xenon/i18n";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";
import { getProfile, profileLabel } from "@/lib/xenon/models";
import { parsePersistedSteps, type MessageWithSteps } from "@/lib/xenon/steps";
import type { AttachmentMeta, ChatMode, MessageDTO } from "@/lib/xenon/types";
import { MarkdownRenderer } from "./markdown-renderer";
import { AgentActivity } from "./agent-activity";

function AttachmentThumb({ attachment }: { attachment: AttachmentMeta }) {
  if (attachment.kind === "image") {
    return (
      <img
        src={attachment.url}
        alt={attachment.name}
        className="max-h-56 rounded-lg border border-border/60 object-cover"
        loading="lazy"
      />
    );
  }
  const Icon = attachment.kind === "audio" ? AudioLines : FileText;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate" dir="auto">{attachment.name}</span>
    </span>
  );
}

/** زنجیرهٔ استدلال قدیمی (متن ساده) — فقط وقتی thinking قالب xenon-steps-v1 نباشد */
function ThinkingBlock({ thinking }: { thinking: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2.5">
      <CollapsibleTrigger className="group/think inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Brain className="h-3.5 w-3.5" aria-hidden />
        <span>{t("message.reasoningChain")}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]/think:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          dir="auto"
          className="xenon-scroll mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-dashed bg-muted/40 p-3 font-mono text-xs leading-6 text-muted-foreground"
        >
          {thinking}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SourceList({ sources }: { sources: NonNullable<MessageDTO["sources"]> }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="mt-2.5 border-t border-border/60 pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{t("message.sources")}</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, index) => (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            title={source.name}
            className="inline-flex max-w-64 items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <span className="font-semibold text-primary" dir="ltr">
              [{formatNumber(source.rank ?? index + 1, locale)}]
            </span>
            <span className="truncate" dir="auto">{source.host_name || source.name}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        ))}
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: MessageDTO;
  isLastAssistant?: boolean;
  onRegenerated?: () => void;
}

export function MessageItem({ message, isLastAssistant = false, onRegenerated }: MessageItemProps) {
  const { toast } = useToast();
  const t = useT();
  const locale = useLocale();
  const streaming = useXenon((s) => s.streaming);
  const speakingId = useXenon((s) => s.speakingId);
  const speakMessage = useXenon((s) => s.speakMessage);
  const regenerate = useXenon((s) => s.regenerate);
  const addMemory = useXenon((s) => s.addMemory);

  const [copied, setCopied] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);

  const isUser = message.role === "user";
  const isSpeaking = speakingId === message.id;
  const isError = message.content.startsWith("⚠️");
  const profile = getProfile((message.model as ChatMode | null | undefined) ?? "general");

  if (isUser) {
    return (
      <article aria-label={t("a11y.yourMessage")} className="flex w-full flex-col items-start">
        <div className="ms-auto max-w-[85%] rounded-2xl rounded-br-md border border-border/60 bg-accent/70 px-3.5 py-2">
          <div className="whitespace-pre-wrap break-words text-[0.85rem] leading-6" dir="auto">{message.content}</div>
        </div>
        {message.attachments && message.attachments.length > 0 ? (
          <div className="ms-auto mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-2">
            {message.attachments.map((att) => (
              <AttachmentThumb key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  // --- فعالیت عامل: گام‌های زندهٔ جریان یا گام‌های ذخیره‌شده (xenon-steps-v1) ---
  const withSteps = message as MessageWithSteps;
  const parsedPersisted = parsePersistedSteps(message.thinking);
  const persistedIsStepsFormat = parsedPersisted !== null;
  const liveSteps = withSteps.steps ?? [];
  const steps = liveSteps.length > 0 ? liveSteps : parsedPersisted ?? [];
  const legacyThinking = message.thinking && !persistedIsStepsFormat ? message.thinking : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => toast({ title: t("message.toast.copyFailed"), variant: "destructive" })
    );
  };

  const handleSpeak = async () => {
    if (isSpeaking) {
      useXenon.getState().stopSpeaking();
      return;
    }
    setTtsBusy(true);
    try {
      await speakMessage(message);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : t("message.toast.ttsFailed"), variant: "destructive" });
    } finally {
      setTtsBusy(false);
    }
  };

  const handleSaveToMemory = () => {
    addMemory(message.content.slice(0, 200), "fact")
      .then(() => toast({ title: t("message.toast.memoryAdded") }))
      .catch(() => toast({ title: t("message.toast.memoryFailed"), variant: "destructive" }));
  };

  const handleRegenerate = () => {
    regenerate()
      .then(() => onRegenerated?.())
      .catch(() => toast({ title: t("message.toast.regenerateFailed"), variant: "destructive" }));
  };

  const showDots = Boolean(message.streaming) && message.content.length === 0 && streaming;

  return (
    <article aria-label={t("a11n.xenonReply")} className="group/msg flex w-full gap-2.5">
      <img src="/xenon-icon.svg" alt={t("a11y.xenonAvatar")} className="mt-0.5 h-5 w-5 shrink-0" />

      <div className={cn("min-w-0 flex-1", isSpeaking && "rounded-xl bg-primary/5 ring-1 ring-primary/25")}>
        {steps.length > 0 ? <AgentActivity steps={steps} /> : null}

        {message.langWarning ? (
          <Alert className="mb-2.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription className="text-xs">{t("message.langWarning")}</AlertDescription>
          </Alert>
        ) : null}

        {legacyThinking ? <ThinkingBlock thinking={legacyThinking} /> : null}

        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-7 text-destructive" dir="auto">
            {message.content}
          </div>
        ) : showDots ? (
          <div className="flex h-7 items-center gap-1.5 px-0.5" aria-label={t("a11y.typing")}>
            <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:300ms]" />
          </div>
        ) : (
          <div className={message.streaming ? "xenon-caret" : undefined}>
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        {message.interrupted && !message.streaming ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1" dir="auto">{t("message.interrupted")}</span>
            {isLastAssistant ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 gap-1 px-1.5 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
                onClick={handleRegenerate}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                {t("composer.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {message.attachments && message.attachments.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <AttachmentThumb key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}

        {message.sources && message.sources.length > 0 ? <SourceList sources={message.sources} /> : null}

        {!message.streaming && message.content ? (
          <footer className="mt-2 flex flex-wrap items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within/msg:opacity-100 md:group-hover/msg:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={copied ? t("a11y.copied") : t("a11y.copyReply")}
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            </Button>
            {isLastAssistant ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label={t("a11y.regenerate")}
                disabled={streaming}
                onClick={handleRegenerate}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7 hover:text-foreground", isSpeaking ? "text-primary" : "text-muted-foreground")}
              aria-label={isSpeaking ? t("a11y.stopSpeaking") : t("a11n.readAloud")}
              disabled={ttsBusy}
              onClick={handleSpeak}
            >
              {isSpeaking ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={t("a11y.saveToMemory")}
              onClick={handleSaveToMemory}
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <span className="xenon-mono ms-1.5 truncate text-muted-foreground/80" dir="auto">
              {profileLabel(profile, locale)}
            </span>
          </footer>
        ) : null}
      </div>
    </article>
  );
}
