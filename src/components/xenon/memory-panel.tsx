"use client";

// زنون ۱ — پنل حافظه پایدار: مشاهده، افزودن و حذف خاطرات

import { useState, type FormEvent } from "react";
import { Brain, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/xenon/i18n";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";

const CATEGORIES: Array<{ value: string; labelKey: "memory.category.preference" | "memory.category.fact" | "memory.category.project" | "memory.category.general" }> = [
  { value: "preference", labelKey: "memory.category.preference" },
  { value: "fact", labelKey: "memory.category.fact" },
  { value: "project", labelKey: "memory.category.project" },
  { value: "general", labelKey: "memory.category.general" },
];

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const { toast } = useToast();
  const t = useT();
  const locale = useLocale();
  const memories = useXenon((s) => s.memories);
  const addMemory = useXenon((s) => s.addMemory);
  const removeMemory = useXenon((s) => s.removeMemory);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [adding, setAdding] = useState(false);

  const categoryLabel = (value: string): string =>
    t(CATEGORIES.find((c) => c.value === value)?.labelKey ?? "memory.category.general");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setAdding(true);
    addMemory(text, category)
      .then(() => {
        setContent("");
        setCategory("general");
        toast({ title: t("memory.toast.added") });
      })
      .catch(() => toast({ title: t("memory.toast.addFailed"), variant: "destructive" }))
      .finally(() => setAdding(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader className="ps-3">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" aria-hidden />
            {t("memory.title")}
          </DialogTitle>
          <DialogDescription>{t("memory.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("memory.inputPlaceholder")}
            aria-label={t("a11y.memoryContent")}
            className="flex-1"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-32" aria-label={t("a11y.memoryCategory")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {t(c.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!content.trim() || adding} className="gap-1.5">
            {adding ? null : <Plus className="h-4 w-4" aria-hidden />}
            {t("common.add")}
          </Button>
        </form>

        <div className="xenon-scroll -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1" aria-label={t("a11y.memoriesList")}>
          {memories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("memory.empty")}</p>
          ) : (
            memories.map((memory) => (
              <div
                key={memory.id}
                className="group/mem flex items-start justify-between gap-3 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm leading-6" dir="auto">{memory.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-2 py-0 text-[0.68rem] font-normal">
                      {categoryLabel(memory.category)}
                    </Badge>
                    <span className="text-[0.68rem] text-muted-foreground">{formatDate(memory.createdAt, locale)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("a11y.deleteMemory")}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    removeMemory(memory.id).catch(() =>
                      toast({ title: t("memory.toast.deleteFailed"), variant: "destructive" })
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="text-[0.7rem] text-muted-foreground">{t("memory.privacy")}</p>
      </DialogContent>
    </Dialog>
  );
}
