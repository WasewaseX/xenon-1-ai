"use client";

// زنون ۱ — بخش نوشتن پیام: پیوست، ضبط صدا، حالت تصویرساز و ارسال

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useXenon } from "@/lib/xenon/store";
import { findCjkCharacters } from "@/lib/xenon/language-guard";
import { transcribeAudio, uploadFile } from "@/lib/xenon/api";
import type { AttachmentMeta } from "@/lib/xenon/types";

const FILE_ACCEPT =
  "image/*,audio/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.css,.html,.xml,.yml,.yaml";
const MAX_TEXTAREA_HEIGHT = 208; // حدود ۸ سطر

function faDigits(n: number): string {
  return n.toLocaleString("fa-IR");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("خواندن فایل صوتی ناموفق بود"));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${faDigits(m)}:${faDigits(s).padStart(2, "۰")}`;
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
      notifyError("ضبط صدا در این مرورگر پشتیبانی نمی‌شود");
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
          notifyError("صدایی ضبط نشد");
          return;
        }
        blobToBase64(blob)
          .then((base64) => transcribeAudio(base64))
          .then(({ text }) => {
            const clean = (text ?? "").trim();
            // شفافیت: درگاه گفتار فعلی برای فارسی/انگلیسی کیفیت محدود دارد
            if (clean && findCjkCharacters(clean).length > 0) {
              notifyError("تشخیص گفتار فارسی در درگاه فعلی محدود است — لطفاً تایپ کنید");
              return;
            }
            if (clean && /[a-zA-Z\u0600-\u06FF]/.test(clean)) {
              onResult(clean);
            } else {
              notifyError("تشخیص گفتار نتیجهٔ قابل استفاده‌ای نداشت — لطفاً تایپ کنید");
            }
          })
          .catch(() => notifyError("تشخیص گفتار ناموفق بود"));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      cleanup();
      notifyError("دسترسی به میکروفون ممکن نشد");
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
  const removeAttachment = useXenon((s) => s.removeAttachment);
  return (
    <div className="group/chip relative flex items-center gap-2 rounded-xl border bg-muted/50 p-1.5 pe-7" dir="auto">
      {attachment.kind === "image" ? (
        <img src={attachment.url} alt={attachment.name} className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-5 w-5" aria-hidden />
        </span>
      )}
      <span className="max-w-36 truncate text-xs text-muted-foreground">{attachment.name}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`حذف پیوست ${attachment.name}`}
        className="absolute end-0.5 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full text-muted-foreground hover:text-destructive"
        onClick={() => removeAttachment(attachment.id)}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function Composer() {
  const { toast } = useToast();

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

  const appendVoiceText = useCallback((t: string) => {
    setDraft((prev) => (prev ? `${prev} ${t}` : t));
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
    sendMessage(value)
      .catch(() => toast({ title: "ارسال پیام ناموفق بود", variant: "destructive" }))
      .finally(() => setDraft(""));
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
        toast({ title: `آپلود «${file.name}» ناموفق بود`, variant: "destructive" });
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
      voice.start().catch(() => notifyVoiceError("تشخیص گفتار ناموفق بود"));
    }
  };

  const placeholder = imageGenMode
    ? "تصویری که می‌خواهی بسازم را توصیف کن…"
    : "پیام خود را بنویسید…";

  return (
    <div className="border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {(attachments.length > 0 || imageGenMode) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {imageGenMode ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                حالت تصویرساز فعال
              </Badge>
            ) : null}
            {attachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} />
            ))}
          </div>
        )}

        <div className="rounded-2xl border bg-card shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20">
          <Textarea
            ref={areaRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            aria-label="متن پیام"
            className="max-h-52 min-h-11 resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
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

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1">
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
                className="h-11 w-11 text-muted-foreground hover:text-foreground"
                aria-label="پیوست فایل"
                disabled={uploading || imageGenMode}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Paperclip className="h-5 w-5" aria-hidden />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 ${
                  voice.recording ? "xenon-recording bg-destructive/15 text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label={voice.recording ? "پایان ضبط صدا" : "ورودی صوتی"}
                disabled={voice.starting || sending}
                onClick={toggleRecording}
              >
                {voice.starting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Mic className="h-5 w-5" aria-hidden />
                )}
              </Button>

              <Button
                variant="ghost"
                className={`h-11 gap-1.5 px-3 text-sm ${
                  imageGenMode ? "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={imageGenMode}
                aria-label="حالت تصویرساز"
                onClick={() => toggleImageGen()}
              >
                <ImageIcon className="h-5 w-5" aria-hidden />
                <span className="hidden sm:inline">تصویرساز</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {draft.length > 0 ? (
                <span className="hidden text-[0.7rem] text-muted-foreground sm:inline">
                  {faDigits(draft.length)} نویسه
                </span>
              ) : null}
              {streaming ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  aria-label="توقف تولید پاسخ"
                  onClick={() => stopStreaming()}
                >
                  <Square className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  aria-label="ارسال پیام"
                  disabled={!canSend}
                  onClick={handleSend}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <SendHorizontal className="h-5 w-5 -scale-x-100" aria-hidden />
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
                در حال ضبط… {formatTimer(voice.seconds)} — برای پایان، دکمهٔ میکروفون را دوباره بزنید
              </>
            ) : recordingHint ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                در حال تبدیل گفتار به نوشتار…
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
                در حال تولید پاسخ…
              </>
            )}
          </p>
        )}

        <p className="mt-1.5 hidden text-center text-[0.7rem] text-muted-foreground sm:block">
          زنون می‌تواند خطا کند. Enter برای ارسال، Shift+Enter برای سطر جدید
        </p>
      </div>
    </div>
  );
}
