"use client";

// زنون ۱ — تنظیمات گفتگو: دستور سیستمی سفارشی و شفافیت مدل

import { useState } from "react";
import { Loader2, Settings, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/lib/xenon/api";
import { useXenon } from "@/lib/xenon/store";
import { getProfile } from "@/lib/xenon/models";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { toast } = useToast();
  const activeId = useXenon((s) => s.activeId);
  const conversations = useXenon((s) => s.conversations);
  const activeMode = useXenon((s) => s.activeMode);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const profile = getProfile(activeMode);

  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  // بارگذاری دستور سیستمی فعلی با الگوی «تنظیم وضعیت در زمان رندر» هنگام تغییر گفتگو/باز شدن
  const syncKey = open ? (activeId ?? "empty") : "closed";
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    setInstruction(open ? (activeConversation?.systemInstruction ?? "") : "");
  }

  const handleSave = () => {
    if (!activeId) return;
    setSaving(true);
    api
      .patchConversation(activeId, { systemInstruction: instruction.trim() || null })
      .then(() => {
        // بروزرسانی محلی گفتگوی فعال در فروش (اکشن اختصاصی در فروش وجود ندارد)
        if (activeId) {
          useXenon.setState((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === activeId ? { ...c, systemInstruction: instruction.trim() || null } : c
            ),
          }));
        }
        toast({ title: "دستور سیستمی ذخیره شد" });
        onOpenChange(false);
      })
      .catch(() => toast({ title: "ذخیره تنظیمات ناموفق بود", variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="ps-3">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" aria-hidden />
            تنظیمات گفتگو
          </DialogTitle>
          <DialogDescription>
            {activeConversation
              ? `مخصوص گفتگوی «${activeConversation.title}»`
              : "برای فعال شدن تنظیمات گفتگو، ابتدا یک گفتگو باز کنید."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="xenon-system-instruction" className="text-sm font-medium">
            دستور سیستمی سفارشی این گفتگو
          </label>
          <Textarea
            id="xenon-system-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="مثلاً: لحن رسمی داشته باش و پاسخ‌ها را کوتاه بنویس…"
            rows={4}
            disabled={!activeId}
            className="resize-none"
          />
          <p className="text-[0.7rem] text-muted-foreground">
            این دستور فقط بر رفتار زنون در همین گفتگو اثر می‌گذارد.
          </p>
        </div>

        <Separator />

        <section aria-label="درباره مدل" className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldQuestion className="h-4 w-4 text-primary" aria-hidden />
            درباره مدل
          </h3>
          <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
            پروفایل فعلی: <span className="font-semibold text-foreground">{profile.label}</span> — تمام
            درخواست‌های متنی توسط درگاه GLM با شناسهٔ served{" "}
            <span className="font-mono" dir="ltr">glm-4-plus</span> پردازش می‌شود؛ بینایی با{" "}
            <span className="font-mono" dir="ltr">glm-4.6v</span>. پروفایل‌ها رفتار (استدلال،
            جست‌وجو، بینایی) را تغییر می‌دهند، نه هویت مدل را.
          </p>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
          <Button onClick={handleSave} disabled={!activeId || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
