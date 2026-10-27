"use client";

// زنون ۱ — بخش نوشتن پیام: انتخابگر حالت (پیل درون نوشتار)، پیوست، ضبط صدا،
// حالت تصویرساز و ارسال. فشرده و هماهنگ با سبک Cursor/Z.ai.
// دو واریانت: «dock» (چسبیده به پایین) و «embedded» (درون صفحهٔ خوش‌آمد).

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Code2,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Sparkles,
  Square,
  Telescope,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNumber, formatTimer, translateNow } from "@/lib/xenon/i18n";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";
import { ROUTING_PROFILES, getProfile, profileDescription, profileLabel } from "@/lib/xenon/models";
import type { ChatMode } from "@/lib/xenon/types";
import { findCjkCharacters } from "@/lib/xenon/language-guard";
import { transcribeAudio, uploadFile } from "@/lib/xenon/api";
import type { AttachmentMeta } from "@/lib/xenon/types";

const FILE_ACCEPT =
  "image/*,audio/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.css,.html,.xml,.yml,.yaml";
const MAX_TEXTAREA_HEIGHT = 184; // حدود ۷ سطر

// آیکون پروفایل‌ها — به‌صورت پویا از ROUTING_PROFILES (Bot = عامل، Globe = دسترسی ابری)
const PROFILE_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Brain,
  Code2,
  Telescope,
  Bot,
  Globe,
};

export function ProfileGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = PROFILE_ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error(translateNow("composer.voice.readFailed")));
    reader.readAsDataURL(blob);
  });
}

/** هوک ضبط صدا: MediaRecorder → base64 → تبدیل گفتار به نوشتار */
function useVoiceInput(onResult: (text: string) => void, notifyError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setSeconds(0);
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notifyError(translateNow("composer.voice.unsupported"));
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(
        (t) => MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        if (blob.size === 0) {
          notifyError(translateNow("composer.voice.noAudio"));
          return;
        }
        blobToBase64(blob)
          .then((base64) => transcribeAudio(base64))
          .then(({ text }) => {
            const clean = (text ?? "").trim();
            // شفافیت: درگاه گفتار فعلی برای فارسی/انگلیسی کیفیت محدود دارد
            if (clean && findCjkCharacters(clean).length > 0) {
              notifyError(translateNow("composer.voice.asrLimited"));
              return;
            }
            if (clean && /[a-zA-Z\u0600-\u06FF]/.test(clean)) {
              onResult(clean);
            } else {
              notifyError(translateNow("composer.voice.noResult"));
            }
          })
          .catch(() => notifyError(translateNow("composer.voice.failed")));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      cleanup();
      notifyError(translateNow("composer.voice.micDenied"));
    } finally {
      setStarting(false);
    }
  }, [cleanup, notifyError, onResult]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // ادامهٔ کار در onstop انجام می‌شود
    } else {
      cleanup();
    }
  }, [cleanup]);

  // آزادسازی منابع هنگام خارج شدن
  useEffect(() => cleanup, [cleanup]);

  return { recording, starting, seconds, start, stop };
}

function AttachmentChip({ attachment }: { attachment: AttachmentMeta }) {
  const t = useT();
  const removeAttachment = useXenon((s) => s.removeAttachment);
  return (
    <div className="group/chip relative flex items-center gap-2 rounded-xl border bg-muted/50 p-1.5 pe-7" dir="auto">
      {attachment.kind === "image" ? (
        <img src={attachment.url} alt={attachment.name} className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4.5 w-4.5" aria-hidden />
        </span>
      )}
      <span className="max-w-36 truncate text-xs text-muted-foreground">{attachment.name}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("a11y.removeAttachment", { name: attachment.name })}
        className="absolute end-0.5 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full text-muted-foreground hover:text-destructive"
        onClick={() => removeAttachment(attachment.id)}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/** پیل انتخابگر حالت — پروفایل‌ها به‌صورت پویا از ROUTING_PROFILES رندر می‌شوند */
function ModePill() {
  const t = useT();
  const locale = useLocale();
  const activeMode = useXenon((s) => s.activeMode);
  const setMode = useXenon((s) => s.setMode);
  const profile = getProfile(activeMode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* suppressHydrationWarning: same as the language button in workspace.tsx —
            silences a benign hydration warning from Radix's auto-generated id in
            React 19.2 dev mode */}
        <button
          type="button"
          suppressHydrationWarning
          aria-label={t("a11y.aiProfile")}
          className="inline-flex h-8 max-w-36 min-w-0 shrink items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:max-w-none"
        >
          <ProfileGlyph name={profile.icon} className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{profileLabel(profile, locale)}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[0.65rem] uppercase tracking-wider text-muted-foreground/70">
          {t("a11y.aiProfile")}
        </DropdownMenuLabel>
        {ROUTING_PROFILES.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => setMode(p.id as ChatMode)}
            aria-pressed={p.id === activeMode}
            className="items-start gap-2.5 py-2"
          >
            <ProfileGlyph name={p.icon} className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium leading-4">{profileLabel(p, locale)}</span>
              <span className="text-[0.68rem] leading-4 text-muted-foreground">
                {profileDescription(p, locale)}
              </span>
            </span>
            {p.id === activeMode ? <Check className="ms-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ComposerProps {
  /** «embedded»: بدون نوار چسبان پایین — برای صفحهٔ خوش‌آمد (نوشتار در مرکز) */
  embedded?: boolean;
}

export function Composer({ embedded = false }: ComposerProps) {
  const { toast } = useToast();
  const t = useT();
  const locale = useLocale();

  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recordingHint, setRecordingHint] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  const sending = useXenon((s) => s.sending);
  const streaming = useXenon((s) => s.streaming);
  const attachments = useXenon((s) => s.attachments);
  const imageGenMode = useXenon((s) => s.imageGenMode);

  const sendMessage = useXenon((s) => s.sendMessage);
  const stopStreaming = useXenon((s) => s.stopStreaming);
  const addAttachment = useXenon((s) => s.addAttachment);
  const toggleImageGen = useXenon((s) => s.toggleImageGen);

  const adjustHeight = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [draft, adjustHeight]);

  const appendVoiceText = useCallback((text: string) => {
    setDraft((prev) => (prev ? `${prev} ${text}` : text));
    setRecordingHint(false);
  }, []);

  const notifyVoiceError = useCallback(
    (message: string) => {
      setRecordingHint(false);
      toast({ title: message, variant: "destructive" });
    },
    [toast]
  );

  const voice = useVoiceInput(appendVoiceText, notifyVoiceError);

  const canSend =
    !sending &&
    !streaming &&
    (draft.trim() ? true : attachments.length > 0 && !imageGenMode);

  const handleSend = () => {
    if (!canSend) return;
    const value = draft.trim();
    // پاک‌سازی فوری نوشتار مثل Cursor/Z.ai؛ در صورت خطا متن بازیابی می‌شود
    setDraft("");
    sendMessage(value)
      .catch(() => {
        setDraft(value);
        toast({ title: t("composer.toast.sendFailed"), variant: "destructive" });
      });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !composingRef.current) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const attachment = await uploadFile(file);
        addAttachment(attachment);
      } catch {
        toast({ title: t("composer.toast.uploadFailed", { name: file.name }), variant: "destructive" });
      }
    }
    setUploading(false);
    e.target.value = "";
  };

  const toggleRecording = () => {
    if (voice.recording) {
      setRecordingHint(true);
      voice.stop();
    } else {
      voice.start().catch(() => notifyVoiceError(translateNow("composer.voice.failed")));
    }
  };

  const placeholder = imageGenMode ? t("composer.imagePlaceholder") : t("composer.placeholder");

  return (
    <div className={embedded ? "w-full" : "border-t border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70"}>
      <div className={cn("mx-auto w-full", embedded ? "" : "max-w-3xl px-4 py-3")}>
        {(attachments.length > 0 || imageGenMode) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {imageGenMode ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                {t("composer.imageGenBadge")}
              </Badge>
            ) : null}
            {attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border/80 bg-card transition-colors focus-within:border-primary/45 focus-within:ring-[3px] focus-within:ring-primary/15">
          <Textarea
            ref={areaRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            aria-label={t("a11y.messageInput")}
            className="max-h-46 min-h-10 resize-none border-0 bg-transparent px-3.5 pt-2.5 text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onInput={adjustHeight}
          />

          <div className="flex items-center gap-1 px-2 pb-1.5 pt-0.5">
            <ModePill />

            <span className="mx-0.5 h-5 w-px shrink-0 bg-border/70" aria-hidden />

            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              multiple
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={handleFiles}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("a11y.attachFile")}
              disabled={uploading || imageGenMode}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                voice.recording
                  ? "xenon-recording bg-destructive/15 text-destructive hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={voice.recording ? t("a11y.stopRecording") : t("a11y.voiceInput")}
              disabled={voice.starting || sending}
              onClick={toggleRecording}
            >
              {voice.starting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                imageGenMode
                  ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={imageGenMode}
              aria-label={t("a11y.imageGenToggle")}
              title={t("composer.imageGenLabel")}
              onClick={() => toggleImageGen()}
            >
              <ImageIcon className="h-4 w-4" aria-hidden />
            </Button>

            <div className="ms-auto flex items-center gap-1.5">
              {draft.length > 0 ? (
                <span className="hidden text-[0.7rem] text-muted-foreground sm:inline">
                  {t("composer.charCount", { count: formatNumber(draft.length, locale) })}
                </span>
              ) : null}
              {streaming ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  aria-label={t("a11y.stopGeneration")}
                  onClick={() => stopStreaming()}
                >
                  <Square className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg shadow-sm"
                  aria-label={t("a11y.sendMessage")}
                  disabled={!canSend}
                  onClick={handleSend}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {(streaming || recordingHint || voice.recording) && (
          <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {voice.recording ? (
              <>
                <span className="size-2 rounded-full bg-destructive xenon-recording" aria-hidden />
                {t("composer.recording", { timer: formatTimer(voice.seconds, locale) })}
              </>
            ) : recordingHint ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("composer.transcribing")}
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
                {t("composer.generating")}
              </>
            )}
          </p>
        )}

        {/* embedded (welcome) shows the keyboard hint only — the disclaimer is
            rendered once by the welcome screen below the suggestion cards */}
        <p className={cn("text-center text-[0.7rem] text-muted-foreground", embedded ? "mt-1.5" : "mt-1.5 hidden sm:block")}>
          {embedded ? t("composer.hintShort") : t("composer.hint")}
        </p>
      </div>
    </div>
  );
}
