"use client";

// زنون ۱ — نوار کناری فشرده: گفتگوی جدید، جست‌وجو، پین‌شده‌ها، پوشه‌ها، فهرست گفتگوها
// و چیپ کاربر در پانوشت (بدون موقعیت‌دهی مطلق). ردیف‌ها ۳۶px؛ حالت فعال با
// bg-white/5 + خط تأکید سمتِ آغاز (border-s) که در RTL خودکار قرینه می‌شود.

import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  MoreVertical,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sun,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/xenon/i18n";
import { useLocale, useT } from "@/components/xenon/locale-provider";
import { useXenon } from "@/lib/xenon/store";
import type { ConversationDTO, FolderDTO } from "@/lib/xenon/types";

const FOLDER_COLORS = ["#8b5cf6", "#d946ef", "#14b8a6", "#f59e0b", "#ef4444", "#10b981"];

type DateGroup = "today" | "yesterday" | "older";

const GROUP_LABEL_KEYS = {
  today: "sidebar.today",
  yesterday: "sidebar.yesterday",
  older: "sidebar.older",
} as const;

function dateGroupOf(iso: string): DateGroup {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "older";
}

/** برچسب کوچک بخش‌ها (PINNED / FOLDERS / CONVERSATIONS) */
function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <h3 className="mb-1 flex items-center justify-between px-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
      <span>{children}</span>
      {action}
    </h3>
  );
}

// ---------- ردیف گفتگو ----------

interface ConversationRowProps {
  conversation: ConversationDTO;
  active: boolean;
  folders: FolderDTO[];
  onOpen: () => void;
  onRenameRequest: (c: ConversationDTO) => void;
  onDeleteRequest: (c: ConversationDTO) => void;
}

function ConversationRow({ conversation, active, folders, onOpen, onRenameRequest, onDeleteRequest }: ConversationRowProps) {
  const t = useT();
  const togglePin = useXenon((s) => s.togglePin);
  const assignToFolder = useXenon((s) => s.assignToFolder);

  return (
    <div
      className={cn(
        "group/row flex items-center rounded-md transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "border-transparent hover:bg-sidebar-accent/60"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-start text-[13px] leading-tight"
      >
        {conversation.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary/90" aria-hidden /> : null}
        <span className="truncate">{conversation.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("a11y.conversationMenu", { title: conversation.title })}
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => togglePin(conversation.id).catch(() => undefined)}>
            {conversation.pinned ? <PinOff className="text-muted-foreground" aria-hidden /> : <Pin className="text-muted-foreground" aria-hidden />}
            {conversation.pinned ? t("sidebar.unpin") : t("sidebar.pin")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRenameRequest(conversation)}>
            <Pencil className="text-muted-foreground" aria-hidden />
            {t("sidebar.rename")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderIcon className="text-muted-foreground" aria-hidden />
              {t("sidebar.moveToFolder")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {folders.length === 0 ? (
                <DropdownMenuItem disabled>{t("sidebar.noFolders")}</DropdownMenuItem>
              ) : (
                folders.map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => assignToFolder(conversation.id, f.id).catch(() => undefined)}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: f.color }} aria-hidden />
                    {f.name}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => assignToFolder(conversation.id, null).catch(() => undefined)}>
                {t("sidebar.noFolder")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDeleteRequest(conversation)}>
            <Trash2 aria-hidden />
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------- ردیف پوشه ----------

interface FolderRowProps {
  folder: FolderDTO;
  folders: FolderDTO[];
  conversations: ConversationDTO[];
  activeId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onOpenConversation: (id: string) => void;
  onRenameRequest: (f: FolderDTO) => void;
  onDeleteRequest: (f: FolderDTO) => void;
  onConversationRenameRequest: (c: ConversationDTO) => void;
  onConversationDeleteRequest: (c: ConversationDTO) => void;
}

function FolderRow(props: FolderRowProps) {
  const t = useT();
  const locale = useLocale();
  const { folder, folders, conversations, activeId, expanded, onToggle } = props;
  return (
    <li>
      <div className="group/frow flex items-center rounded-md transition-colors hover:bg-sidebar-accent/60">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-start text-[13px] leading-tight"
        >
          <svg
            viewBox="0 0 24 24"
            className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", expanded ? "rotate-90" : "rotate-0")}
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: folder.color }} aria-hidden />
          <span className="truncate">{folder.name}</span>
          <span className="ms-auto text-[0.6rem] tabular-nums text-muted-foreground">{formatNumber(conversations.length, locale)}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("a11y.folderMenu", { name: folder.name })}
              className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/frow:opacity-100"
            >
              <MoreVertical className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => props.onRenameRequest(folder)}>
              <Pencil className="text-muted-foreground" aria-hidden />
              {t("sidebar.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => props.onDeleteRequest(folder)}>
              <Trash2 aria-hidden />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? (
        <ul className="ms-3 space-y-0.5 border-s border-border/60 ps-1">
          {conversations.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">{t("sidebar.emptyFolder")}</li>
          ) : (
            conversations.map((c) => (
              <li key={c.id}>
                <ConversationRow
                  conversation={c}
                  active={c.id === activeId}
                  folders={folders}
                  onOpen={() => props.onOpenConversation(c.id)}
                  onRenameRequest={props.onConversationRenameRequest}
                  onDeleteRequest={props.onConversationDeleteRequest}
                />
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

// ---------- چیپ کاربر + کلید سریع پوسته (پانوشت نوار کناری) ----------

function SidebarFooterChip() {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const guestName = t("sidebar.userGuest");

  return (
    <div className="mt-auto shrink-0 border-t border-border/60 p-2">
      <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-sidebar-accent/50">
        <span
          className="flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-primary/15 text-[0.7rem] font-semibold text-primary"
          aria-hidden
        >
          {guestName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-medium">{guestName}</p>
          <p className="truncate text-[0.65rem] text-muted-foreground">{t("sidebar.userLocal")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("a11y.toggleTheme")}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="hidden h-3.5 w-3.5 dark:block" aria-hidden />
          <Moon className="block h-3.5 w-3.5 dark:hidden" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------- محتوای نوار کناری (قابل استفاده در دسکتاپ و موبایل) ----------

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const conversations = useXenon((s) => s.conversations);
  const folders = useXenon((s) => s.folders);
  const messages = useXenon((s) => s.messages);
  const activeId = useXenon((s) => s.activeId);
  const loadingSidebar = useXenon((s) => s.loadingSidebar);
  const searchQuery = useXenon((s) => s.searchQuery);
  const setSearchQuery = useXenon((s) => s.setSearchQuery);
  const newChat = useXenon((s) => s.newChat);
  const openConversation = useXenon((s) => s.openConversation);
  const renameConversation = useXenon((s) => s.renameConversation);
  const removeConversation = useXenon((s) => s.removeConversation);
  const createFolder = useXenon((s) => s.createFolder);
  const renameFolder = useXenon((s) => s.renameFolder);
  const removeFolder = useXenon((s) => s.removeFolder);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = useState<ConversationDTO | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConversationDTO | null>(null);
  const [folderRenameTarget, setFolderRenameTarget] = useState<FolderDTO | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderDTO | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = useMemo(
    () =>
      (c: ConversationDTO): boolean => {
        if (!query) return true;
        if (c.title.toLowerCase().includes(query)) return true;
        if (c.id === activeId && messages.some((m) => m.content.toLowerCase().includes(query))) return true;
        return false;
      },
    [query, activeId, messages]
  );

  const pinned = useMemo(
    () => conversations.filter((c) => c.pinned && matchesQuery(c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations, matchesQuery]
  );
  const ungrouped = useMemo(
    () => conversations.filter((c) => !c.folderId && !c.pinned && matchesQuery(c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations, matchesQuery]
  );

  const grouped = useMemo(() => {
    const groups: Record<DateGroup, ConversationDTO[]> = { today: [], yesterday: [], older: [] };
    for (const c of ungrouped) groups[dateGroupOf(c.updatedAt)].push(c);
    return groups;
  }, [ungrouped]);

  const isEmpty = !loadingSidebar && conversations.length === 0;
  const totalMatches = useMemo(() => conversations.filter(matchesQuery).length, [conversations, matchesQuery]);
  const showNoResults = !loadingSidebar && query.length > 0 && totalMatches === 0;

  const handleOpen = (id: string) => {
    openConversation(id).catch(() => undefined);
    onNavigate?.();
  };

  const handleNewChat = () => {
    newChat();
    onNavigate?.();
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    createFolder(name, newFolderColor)
      .then(() => {
        toast({ title: t("sidebar.toast.folderCreated") });
        setNewFolderOpen(false);
        setNewFolderName("");
        setNewFolderColor(FOLDER_COLORS[0]);
      })
      .catch(() => toast({ title: t("sidebar.toast.folderCreateFailed"), variant: "destructive" }));
  };

  const confirmRenameConversation = () => {
    const title = renameValue.trim();
    if (!renameTarget || !title) return;
    renameConversation(renameTarget.id, title)
      .then(() => setRenameTarget(null))
      .catch(() => toast({ title: t("sidebar.toast.renameFailed"), variant: "destructive" }));
  };

  const confirmRenameFolder = () => {
    const name = folderRenameValue.trim();
    if (!folderRenameTarget || !name) return;
    renameFolder(folderRenameTarget.id, name)
      .then(() => setFolderRenameTarget(null))
      .catch(() => toast({ title: t("sidebar.toast.folderRenameFailed"), variant: "destructive" }));
  };

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRow = (c: ConversationDTO) => (
    <ConversationRow
      key={c.id}
      conversation={c}
      active={c.id === activeId}
      folders={folders}
      onOpen={() => handleOpen(c.id)}
      onRenameRequest={(conv) => {
        setRenameValue(conv.title);
        setRenameTarget(conv);
      }}
      onDeleteRequest={(conv) => setDeleteTarget(conv)}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="space-y-2.5 p-2.5">
        <Button
          variant="outline"
          className="h-9 w-full gap-2 rounded-lg border-border/70 bg-background/40 text-[0.8rem] font-medium hover:bg-sidebar-accent"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4 text-primary" aria-hidden />
          {t("sidebar.newChat")}
          <kbd className="ms-auto hidden font-mono text-[0.62rem] text-muted-foreground/70 lg:inline" dir="ltr">
            ⇧⌘O
          </kbd>
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="xenon-sidebar-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("a11y.searchConversations")}
            className="h-8 rounded-lg border-border/70 bg-background/40 ps-8 text-xs"
          />
        </div>
      </div>

      <nav aria-label={t("sidebar.conversations")} className="xenon-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 pb-3">
        {loadingSidebar ? (
          <div className="space-y-1.5" aria-label={t("a11y.loading")}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessageSquare className="h-7 w-7 text-muted-foreground/50" aria-hidden />
            <p className="text-xs text-muted-foreground">{t("sidebar.emptyTitle")}</p>
            <p className="text-[0.7rem] text-muted-foreground/70">{t("sidebar.emptyHint")}</p>
          </div>
        ) : showNoResults ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">{t("sidebar.noResults")}</p>
        ) : (
          <>
            {pinned.length > 0 ? (
              <section aria-label={t("sidebar.pinned")}>
                <SectionLabel>{t("sidebar.pinned")}</SectionLabel>
                <ul className="space-y-0.5">{pinned.map(renderRow)}</ul>
              </section>
            ) : null}

            <section aria-label={t("sidebar.folders")}>
              <SectionLabel
                action={
                  <button
                    type="button"
                    onClick={() => setNewFolderOpen(true)}
                    className="inline-flex h-5.5 items-center gap-1 rounded-md px-1.5 text-[0.6rem] font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={t("a11y.newFolder")}
                  >
                    <FolderPlus className="h-3 w-3" aria-hidden />
                    {t("sidebar.newFolder")}
                  </button>
                }
              >
                {t("sidebar.folders")}
              </SectionLabel>
              {folders.length === 0 ? (
                <p className="px-1.5 py-1 text-[0.7rem] text-muted-foreground/70">{t("sidebar.foldersHint")}</p>
              ) : (
                <ul className="space-y-0.5">
                  {folders.map((f) => {
                    const convs = conversations
                      .filter((c) => c.folderId === f.id && matchesQuery(c))
                      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
                    return (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        folders={folders}
                        conversations={convs}
                        activeId={activeId}
                        expanded={!collapsedFolders.has(f.id)}
                        onToggle={() => toggleFolder(f.id)}
                        onOpenConversation={handleOpen}
                        onRenameRequest={(folder) => {
                          setFolderRenameValue(folder.name);
                          setFolderRenameTarget(folder);
                        }}
                        onDeleteRequest={(folder) => setFolderDeleteTarget(folder)}
                        onConversationRenameRequest={(conv) => {
                          setRenameValue(conv.title);
                          setRenameTarget(conv);
                        }}
                        onConversationDeleteRequest={(conv) => setDeleteTarget(conv)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-label={t("sidebar.conversations")}>
              <SectionLabel>{t("sidebar.conversations")}</SectionLabel>
              {ungrouped.length === 0 ? (
                <p className="px-1.5 py-1 text-[0.7rem] text-muted-foreground/70">{t("sidebar.noUnfiled")}</p>
              ) : (
                (["today", "yesterday", "older"] as DateGroup[]).map((group) =>
                  grouped[group].length > 0 ? (
                    <div key={group} className="mb-3">
                      <h4 className="mb-1 px-1.5 text-[0.65rem] font-medium text-muted-foreground/80">{t(GROUP_LABEL_KEYS[group])}</h4>
                      <ul className="space-y-0.5">{grouped[group].map(renderRow)}</ul>
                    </div>
                  ) : null
                )
              )}
            </section>
          </>
        )}
      </nav>

      <SidebarFooterChip />

      {/* گفتگوی تغییر نام گفتگو */}
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sidebar.renameConversationTitle")}</DialogTitle>
            <DialogDescription>{t("sidebar.renameConversationDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder={t("sidebar.conversationTitlePlaceholder")}
            aria-label={t("a11y.conversationTitle")}
            onKeyDown={(e) => e.key === "Enter" && confirmRenameConversation()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmRenameConversation} disabled={!renameValue.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی حذف گفتگو */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteConversationTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteConversationDesc", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                removeConversation(deleteTarget.id).catch(() => undefined);
                setDeleteTarget(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* گفتگوی تغییر نام پوشه */}
      <Dialog open={Boolean(folderRenameTarget)} onOpenChange={(open) => !open && setFolderRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sidebar.renameFolderTitle")}</DialogTitle>
            <DialogDescription>{t("sidebar.renameFolderDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={folderRenameValue}
            onChange={(e) => setFolderRenameValue(e.target.value)}
            placeholder={t("a11y.folderName")}
            aria-label={t("a11y.folderNameInput")}
            onKeyDown={(e) => e.key === "Enter" && confirmRenameFolder()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmRenameFolder} disabled={!folderRenameValue.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی حذف پوشه */}
      <AlertDialog open={Boolean(folderDeleteTarget)} onOpenChange={(open) => !open && setFolderDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.deleteFolder")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.deleteFolderDesc", { name: folderDeleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!folderDeleteTarget) return;
                removeFolder(folderDeleteTarget.id).catch(() => undefined);
                setFolderDeleteTarget(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* گفتگوی ساخت پوشه */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sidebar.newFolderTitle")}</DialogTitle>
            <DialogDescription>{t("sidebar.newFolderDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t("a11y.folderName")}
            aria-label={t("a11y.folderNameInput")}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <div className="flex items-center gap-2" role="radiogroup" aria-label={t("a11y.folderColor")}>
            {FOLDER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={newFolderColor === color}
                aria-label={t("a11y.colorValue", { color })}
                onClick={() => setNewFolderColor(color)}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  newFolderColor === color ? "scale-110 border-foreground" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              {t("sidebar.createFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- نوار کناری دسکتاپ (w-64، جمع‌شونده) ----------

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 overflow-hidden border-e border-border/60 bg-sidebar transition-[width] duration-200 ease-out lg:block",
        collapsed ? "w-0 border-e-0" : "w-64"
      )}
    >
      <div className={cn("h-full w-64", collapsed && "invisible")}>
        <SidebarContent />
      </div>
    </aside>
  );
}
