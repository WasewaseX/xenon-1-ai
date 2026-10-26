"use client";

// زنون ۱ — نمایش یک پیام (کاربر یا دستیار) همراه با اقدامات

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useXenon } from "@/lib/xenon/store";
import { getProfile } from "@/lib/xenon/models";
import type { AttachmentMeta, ChatMode, MessageDTO } from "@/lib/xenon/types";
import { MarkdownRenderer } from "./markdown-renderer";

function faDigits(n: number): string {
  return n.toLocaleString("fa-IR");
}

function AttachmentThumb({ attachment }: { attachment: AttachmentMeta }) {
  if (attachment.kind === "image") {
    return (
      <img
        src={attachment.url}
        alt={attachment.name}
        className="max-h-56 rounded-lg border border-primary/20 object-cover"
        loading="lazy"
      />
    );
  }
  const Icon = attachment.kind === "audio" ? AudioLines : FileText;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate" dir="auto">{attachment.name}</span>
    </span>
  );
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="group/think inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Brain className="h-3.5 w-3.5" aria-hidden />
        <span>زنجیره استدلال</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]/think:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          dir="auto"
          className="xenon-scroll mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-dashed bg-muted/40 p-3 font-mono text-xs leading-6 text-muted-foreground"
        >
          {thinking}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SourceList({ sources }: { sources: NonNullable<MessageDTO["sources"]> }) {
  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">منابع</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, index) => (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            title={source.name}
            className="inline-flex max-w-64 items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <span className="font-semibold text-primary">[{faDigits(source.rank ?? index + 1)}]</span>
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
      <article aria-label="پیام شما" className="flex w-full flex-col items-start">
        <div className="ms-auto max-w-[85%] rounded-2xl rounded-te-sm bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="whitespace-pre-wrap break-words text-[0.95rem] leading-7">{message.content}</div>
        </div>
        {message.attachments && message.attachments.length > 0 ? (
          <div className="ms-auto mt-2 flex max-w-[85%] flex-wrap justify-end gap-2">
            {message.attachments.map((att) => (
              <AttachmentThumb key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => toast({ title: "کپی ناموفق بود", variant: "destructive" })
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
      toast({ title: err instanceof Error ? err.message : "تولید گفتار ناموفق بود", variant: "destructive" });
    } finally {
      setTtsBusy(false);
    }
  };

  const handleSaveToMemory = () => {
    addMemory(message.content.slice(0, 200), "fact")
      .then(() => toast({ title: "به حافظه اضافه شد" }))
      .catch(() => toast({ title: "افزودن به حافظه ناموفق بود", variant: "destructive" }));
  };

  const handleRegenerate = () => {
    regenerate()
      .then(() => onRegenerated?.())
      .catch(() => toast({ title: "بازتولید پاسخ ناموفق بود", variant: "destructive" }));
  };

  const showDots = Boolean(message.streaming) && message.content.length === 0 && streaming;

  return (
    <article aria-label="پاسخ زنون" className="group/msg w-full">
      <div
        className={`rounded-2xl border bg-card/60 p-4 transition-shadow ${
          isSpeaking ? "border-primary/50 ring-2 ring-primary/30" : ""
        }`}
      >
        <header className="mb-2.5 flex flex-wrap items-center gap-2">
          <img src="/xenon-icon.svg" alt="آیکون زنون" className="h-6 w-6" />
          <span className="text-sm font-bold">زنون</span>
          <Badge variant="secondary" className="rounded-full px-2 py-0 text-[0.7rem] font-normal">
            {profile.label}
          </Badge>
          {message.servedModel ? (
            <span className="text-[0.68rem] text-muted-foreground" dir="ltr">
              سرو: {message.servedModel}
            </span>
          ) : null}
        </header>

        {message.langWarning ? (
          <Alert className="mb-3 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription className="text-xs">
              هشدار سازگاری زبانی: نویسه‌های غیرمنتظره در پاسخ شناسایی شد.
            </AlertDescription>
          </Alert>
        ) : null}

        {message.thinking ? <ThinkingBlock thinking={message.thinking} /> : null}

        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-7 text-destructive">
            {message.content}
          </div>
        ) : showDots ? (
          <div className="flex h-8 items-center gap-1.5 px-1" aria-label="در حال نوشتن">
            <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:0ms]" />
            <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:150ms]" />
            <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:300ms]" />
          </div>
        ) : (
          <div className={message.streaming ? "xenon-caret" : undefined}>
            <MarkdownRenderer content={message.content} />
          </div>
        )}

        {message.attachments && message.attachments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <AttachmentThumb key={att.id} attachment={att} />
            ))}
          </div>
        ) : null}

        {message.sources && message.sources.length > 0 ? <SourceList sources={message.sources} /> : null}

        {!message.streaming && message.content ? (
          <footer className="mt-3 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within/msg:opacity-100 md:group-hover/msg:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={copied ? "کپی شد" : "کپی پاسخ"}
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4 text-primary" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
            {isLastAssistant ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="تولید دوباره پاسخ"
                disabled={streaming}
                onClick={handleRegenerate}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 hover:text-foreground ${isSpeaking ? "text-primary" : "text-muted-foreground"}`}
              aria-label={isSpeaking ? "توقف پخش صدا" : "خواندن پاسخ با صدا"}
              disabled={ttsBusy}
              onClick={handleSpeak}
            >
              {isSpeaking ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="ذخیره در حافظه"
              onClick={handleSaveToMemory}
            >
              <BookmarkPlus className="h-4 w-4" aria-hidden />
            </Button>
          </footer>
        ) : null}
      </div>
    </article>
  );
}
