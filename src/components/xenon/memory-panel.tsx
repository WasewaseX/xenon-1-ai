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
import { useXenon } from "@/lib/xenon/store";

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "preference", label: "ترجیح" },
  { value: "fact", label: "دانش" },
  { value: "project", label: "پروژه" },
  { value: "general", label: "عمومی" },
];

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "عمومی";
}

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const { toast } = useToast();
  const memories = useXenon((s) => s.memories);
  const addMemory = useXenon((s) => s.addMemory);
  const removeMemory = useXenon((s) => s.removeMemory);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [adding, setAdding] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setAdding(true);
    addMemory(text, category)
      .then(() => {
        setContent("");
        setCategory("general");
        toast({ title: "به حافظه اضافه شد" });
      })
      .catch(() => toast({ title: "افزودن به حافظه ناموفق بود", variant: "destructive" }))
      .finally(() => setAdding(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader className="ps-3">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" aria-hidden />
            حافظه پایدار
          </DialogTitle>
          <DialogDescription>
            اطلاعاتی که زنون برای پاسخ‌های شخصی‌تر به‌کار می‌گیرد. هر زمان بخواهید می‌توانید ببینید، ویرایش یا حذف کنید.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="چیز تازه‌ای درباره خودتان بگویید…"
            aria-label="محتوای حافظه جدید"
            className="flex-1"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-32" aria-label="دسته‌بندی حافظه">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!content.trim() || adding} className="gap-1.5">
            {adding ? null : <Plus className="h-4 w-4" aria-hidden />}
            افزودن
          </Button>
        </form>

        <div className="xenon-scroll -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1" aria-label="فهرست حافظه‌ها">
          {memories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              حافظه خالی است. از دکمهٔ «ذخیره در حافظه» زیر پیام‌ها هم می‌توانید استفاده کنید.
            </p>
          ) : (
            memories.map((memory) => (
              <div
                key={memory.id}
                className="group/mem flex items-start justify-between gap-3 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{memory.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-2 py-0 text-[0.68rem] font-normal">
                      {categoryLabel(memory.category)}
                    </Badge>
                    <span className="text-[0.68rem] text-muted-foreground">
                      {new Date(memory.createdAt).toLocaleDateString("fa-IR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف این حافظه"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    removeMemory(memory.id).catch(() =>
                      toast({ title: "حذف حافظه ناموفق بود", variant: "destructive" })
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))
          )}
        </div>

        <p className="text-[0.7rem] text-muted-foreground">
          حافظه فقط با تأیید شما پر می‌شود و روی دستگاه شما ذخیره می‌ماند.
        </p>
      </DialogContent>
    </Dialog>
  );
}
