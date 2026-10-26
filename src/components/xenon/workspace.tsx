"use client";

// زنون ۱ — پوسته اصلی برنامه: نوار کناری، سربرگ، ناحیه گفتگو، نوشتار و نوار وضعیت

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Brain, Code2, Menu, Moon, Settings, Sparkles, Sun, Telescope, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROUTING_PROFILES } from "@/lib/xenon/models";
import { useXenon } from "@/lib/xenon/store";
import type { ChatMode } from "@/lib/xenon/types";
import { ChatArea } from "./chat-area";
import { Composer } from "./composer";
import { MemoryPanel } from "./memory-panel";
import { SettingsDialog } from "./settings-dialog";
import { Sidebar, SidebarContent } from "./sidebar";

const PROFILE_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Brain,
  Code2,
  Telescope,
};

function ProfileGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = PROFILE_ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

function faDigits(n: number): string {
  return n.toLocaleString("fa-IR");
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="تغییر حالت روشن و تاریک"
      className="h-11 w-11 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* تعویض آیکون با CSS تا از ناسازگاری آب‌پراکنی (hydration) جلوگیری شود */}
      <Sun className="hidden h-5 w-5 dark:block" aria-hidden />
      <Moon className="block h-5 w-5 dark:hidden" aria-hidden />
    </Button>
  );
}

function ModeSelector() {
  const activeMode = useXenon((s) => s.activeMode);
  const setMode = useXenon((s) => s.setMode);

  // دسکتاپ: دکمه‌های پروفایل
  return (
    <>
      <nav aria-label="انتخاب پروفایل هوش مصنوعی" className="hidden items-center gap-1 md:flex">
        {ROUTING_PROFILES.map((profile) => {
          const active = profile.id === activeMode;
          return (
            <button
              key={profile.id}
              type="button"
              title={profile.description}
              aria-pressed={active}
              onClick={() => setMode(profile.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <ProfileGlyph name={profile.icon} className="h-4 w-4" />
              {profile.label}
            </button>
          );
        })}
      </nav>
      {/* موبایل: انتخابگر فشرده */}
      <div className="md:hidden">
        <Select value={activeMode} onValueChange={(value) => setMode(value as ChatMode)}>
          <SelectTrigger
            aria-label="انتخاب پروفایل هوش مصنوعی"
            className="h-9 w-36 gap-1 text-xs"
          >
            <span className="flex items-center gap-1.5">
              <ProfileGlyph name={ROUTING_PROFILES.find((p) => p.id === activeMode)?.icon ?? "Sparkles"} className="h-4 w-4 text-primary" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {ROUTING_PROFILES.map((profile) => (
              <SelectItem key={profile.id} value={profile.id} textValue={profile.label}>
                <span className="flex items-center gap-2">
                  <ProfileGlyph name={profile.icon} className="h-4 w-4 text-primary" />
                  {profile.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function Header({
  onOpenMobileNav,
  onOpenMemory,
  onOpenSettings,
}: {
  onOpenMobileNav: () => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="باز کردن فهرست گفتگوها"
        className="h-11 w-11 lg:hidden"
        onClick={onOpenMobileNav}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <div className="flex shrink-0 items-center gap-2.5">
        <img src="/xenon-icon.svg" alt="آیکون زنون ۱" className="h-7 w-7 shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="whitespace-nowrap text-base font-bold">زنون ۱</span>
          <span className="hidden text-[0.65rem] text-muted-foreground sm:block">
            پلتفرم هوش مصنوعی فارسی
          </span>
        </div>
      </div>

      <div className="mx-auto min-w-0">
        <ModeSelector />
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <Button
          variant="ghost"
          aria-label="حافظه پایدار"
          className="h-11 gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground sm:px-3"
          onClick={onOpenMemory}
        >
          <Brain className="h-5 w-5" aria-hidden />
          <span className="hidden md:inline">حافظه</span>
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="تنظیمات گفتگو"
          className="h-11 w-11 text-muted-foreground hover:text-foreground"
          onClick={onOpenSettings}
        >
          <Settings className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}

function StatusBar() {
  const stats = useXenon((s) => s.stats);
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t px-3 text-[0.7rem] text-muted-foreground sm:px-4">
      <span className="flex items-center gap-1.5" dir="rtl">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
        موتور استنتاج: درگاه GLM <span dir="ltr">(served: glm-4-plus)</span>
      </span>
      <span aria-live="polite">
        {stats
          ? `${faDigits(stats.conversations)} گفتگو · ${faDigits(stats.messages)} پیام · ${faDigits(stats.memories)} حافظه`
          : "…"}
      </span>
    </footer>
  );
}

export function XenonWorkspace() {
  const bootstrap = useXenon((s) => s.bootstrap);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    bootstrap().catch(() => undefined);
  }, [bootstrap]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="right" className="w-[19rem] border-s bg-sidebar p-0 sm:max-w-[19rem]">
          <SheetHeader className="sr-only">
            <SheetTitle>فهرست گفتگوها</SheetTitle>
            <SheetDescription>گفتگوها، پوشه‌ها و جست‌وجو</SheetDescription>
          </SheetHeader>
          <div className="h-full pt-12">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <ChatArea />
        <Composer />
        <StatusBar />
      </main>

      <MemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
