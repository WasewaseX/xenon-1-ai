"use client";

// زنون ۱ — پوسته اصلی برنامه: نوار کناری جمع‌شونده، سربرگ فشرده (h-12)، ناحیه گفتگو،
// نوشتار و نوار وضعیت تک‌خطی. دوزبانه (EN/FA)؛ انتخابگر حالت داخل نوشتار است (نه سربرگ)
// تا هم‌پوشانی کنترل‌ها در موبایل ساختاری از بین برود.

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Check,
  Languages,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatNumber, useI18n } from "@/lib/xenon/i18n";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { SERVED_TEXT_MODEL } from "@/lib/xenon/models";
import { useXenon } from "@/lib/xenon/store";
import { ChatArea } from "./chat-area";
import { Composer } from "./composer";
import { MemoryPanel } from "./memory-panel";
import { SettingsDialog } from "./settings-dialog";
import { Sidebar, SidebarContent } from "./sidebar";
import { WelcomeScreen } from "./welcome-screen";

function ThemeToggle() {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("a11y.toggleTheme")}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* تعویض آیکون با CSS تا از ناسازگاری آب‌پراکنی (hydration) جلوگیری شود */}
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="block h-4 w-4 dark:hidden" aria-hidden />
    </Button>
  );
}

function LanguageSwitcher() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useI18n((s) => s.setLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* suppressHydrationWarning: in React 19.2/Next 16 dev mode, the Radix trigger's
            auto-generated useId can occasionally differ between server and client render
            (final DOM is identical, no functional impact) — this only silences that
            benign warning. */}
        <Button
          variant="ghost"
          size="icon"
          suppressHydrationWarning
          aria-label={t("a11y.changeLanguage")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Languages className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {(
          [
            { value: "en", label: "English" },
            { value: "fa", label: "فارسی" },
          ] as const
        ).map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setLocale(option.value)}
            aria-pressed={locale === option.value}
            className="gap-2"
          >
            <Check
              className={cn("h-4 w-4 text-primary", locale === option.value ? "opacity-100" : "opacity-0")}
              aria-hidden
            />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface HeaderProps {
  activeTitle: string;
  sidebarCollapsed: boolean;
  onOpenMobileNav: () => void;
  onToggleSidebar: () => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
}

function Header({
  activeTitle,
  sidebarCollapsed,
  onOpenMobileNav,
  onToggleSidebar,
  onOpenMemory,
  onOpenSettings,
}: HeaderProps) {
  const t = useT();
  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/50 bg-background/80 px-2 backdrop-blur sm:gap-1.5 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("a11y.openConversations")}
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
        onClick={onOpenMobileNav}
      >
        <Menu className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("a11y.toggleSidebar")}
        title={t("a11y.toggleSidebar")}
        className="hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground lg:inline-flex"
        onClick={onToggleSidebar}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
      </Button>

      <div className="flex shrink-0 items-center gap-2 ps-0.5">
        <img src="/xenon-icon.svg" alt={t("a11y.xenonIcon")} className="h-6 w-6 shrink-0" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">Xenon 1</span>
      </div>

      {activeTitle ? (
        <>
          <span className="mx-1 hidden h-3.5 w-px shrink-0 bg-border/70 sm:block" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate text-[0.8rem] text-muted-foreground" title={activeTitle}>
            {activeTitle}
          </h2>
        </>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("a11y.memory")}
          title={t("a11y.memory")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onOpenMemory}
        >
          <Brain className="h-4 w-4" aria-hidden />
        </Button>
        <LanguageSwitcher />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("a11y.settings")}
          title={t("a11y.settings")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}

function StatusBar() {
  const t = useT();
  const locale = useLocale();
  const stats = useXenon((s) => s.stats);
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border/50 px-3 text-[0.7rem] text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <span className="truncate">
          {t("status.attribution")}{" "}
          <span className="xenon-mono" dir="ltr">
            (served: {SERVED_TEXT_MODEL})
          </span>
        </span>
      </span>
      <a
        href="/novel/the-ninth-vein.pdf"
        target="_blank"
        rel="noreferrer"
        className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground sm:flex"
        aria-label={t("status.library")}
      >
        <BookOpen className="size-3" aria-hidden />
        {t("status.library")}
      </a>
      <span aria-live="polite" className="xenon-mono ms-auto hidden shrink-0 whitespace-nowrap tabular-nums sm:inline">
        {stats
          ? t("status.stats", {
              conversations: formatNumber(stats.conversations, locale),
              messages: formatNumber(stats.messages, locale),
              memories: formatNumber(stats.memories, locale),
            })
          : t("status.loading")}
      </span>
    </footer>
  );
}

export function XenonWorkspace() {
  const t = useT();
  const locale = useLocale();
  const bootstrap = useXenon((s) => s.bootstrap);
  const activeId = useXenon((s) => s.activeId);
  const conversations = useXenon((s) => s.conversations);
  const messages = useXenon((s) => s.messages);
  const loadingMessages = useXenon((s) => s.loadingMessages);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    bootstrap().catch(() => undefined);
  }, [bootstrap]);

  // کلیدهای میان‌بر: Ctrl/Cmd+K جست‌وجوی نوار کناری، Ctrl/Cmd+Shift+O گفتگوی جدید
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        const inputs = document.querySelectorAll<HTMLInputElement>("#xenon-sidebar-search");
        const visible = Array.from(inputs).find((el) => el.offsetParent !== null);
        const target = visible ?? inputs[0];
        target?.focus();
        target?.select();
      } else if (key === "o" && e.shiftKey) {
        e.preventDefault();
        useXenon.getState().newChat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "";
  const showHero = !activeId && messages.length === 0 && !loadingMessages;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar collapsed={sidebarCollapsed} />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side={locale === "fa" ? "right" : "left"} className="w-[17rem] border-e border-border/60 bg-sidebar p-0 sm:max-w-[17rem]">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("app.sheetNavTitle")}</SheetTitle>
            <SheetDescription>{t("app.sheetNavDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col pt-10">
            <div className="min-h-0 flex-1">
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          activeTitle={activeTitle}
          sidebarCollapsed={sidebarCollapsed}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <motion.div
          key={showHero ? "hero" : "chat"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {showHero ? (
            <WelcomeScreen />
          ) : (
            <>
              <ChatArea />
              <Composer />
            </>
          )}
        </motion.div>

        <StatusBar />
      </main>

      <MemoryPanel open={memoryOpen} onOpenChange={setMemoryOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
