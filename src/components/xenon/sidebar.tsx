"use client";

// زنون ۱ — نوار کناری: گفتگوی جدید، جست‌وجو، پین‌شده‌ها، پوشه‌ها و فهرست گفتگوها

import { useMemo, useState } from "react";
import {
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
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
import { useXenon } from "@/lib/xenon/store";
import type { ConversationDTO, FolderDTO } from "@/lib/xenon/types";

const FOLDER_COLORS = ["#8b5cf6", "#d946ef", "#14b8a6", "#f59e0b", "#ef4444", "#10b981"];

type DateGroup = "today" | "yesterday" | "older";

const GROUP_LABELS: Record<DateGroup, string> = {
  today: "امروز",
  yesterday: "دیروز",
  older: "قدیمی‌تر",
};

function dateGroupOf(iso: string): DateGroup {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "older";
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
  const togglePin = useXenon((s) => s.togglePin);
  const assignToFolder = useXenon((s) => s.assignToFolder);

  return (
    <div
      className={cn(
        "group/row flex items-center rounded-lg transition-colors",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-start text-sm"
      >
        {conversation.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" aria-hidden /> : null}
        <span className="truncate">{conversation.title}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`منوی گفتگوی ${conversation.title}`}
            className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => togglePin(conversation.id).catch(() => undefined)}>
            {conversation.pinned ? <PinOff className="text-muted-foreground" aria-hidden /> : <Pin className="text-muted-foreground" aria-hidden />}
            {conversation.pinned ? "برداشتن پین" : "پین کردن"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRenameRequest(conversation)}>
            <Pencil className="text-muted-foreground" aria-hidden />
            تغییر نام
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderIcon className="text-muted-foreground" aria-hidden />
              انتقال به پوشه
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {folders.length === 0 ? (
                <DropdownMenuItem disabled>پوشه‌ای وجود ندارد</DropdownMenuItem>
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
                بدون پوشه
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDeleteRequest(conversation)}>
            <Trash2 aria-hidden />
            حذف
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
  const { folder, folders, conversations, activeId, expanded, onToggle } = props;
  return (
    <li>
      <div className="group/frow flex items-center rounded-lg transition-colors hover:bg-sidebar-accent/60">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-start text-sm"
        >
          <svg
            viewBox="0 0 24 24"
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded ? "rotate-90" : "rotate-0")}
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: folder.color }} aria-hidden />
          <span className="truncate">{folder.name}</span>
          <span className="ms-auto text-[0.65rem] text-muted-foreground">{conversations.length.toLocaleString("fa-IR")}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`منوی پوشه ${folder.name}`}
              className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/frow:opacity-100"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => props.onRenameRequest(folder)}>
              <Pencil className="text-muted-foreground" aria-hidden />
              تغییر نام
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => props.onDeleteRequest(folder)}>
              <Trash2 aria-hidden />
              حذف پوشه
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? (
        <ul className="ms-4 space-y-0.5 border-s ps-1.5">
          {conversations.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">گفتگویی در این پوشه نیست</li>
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

// ---------- محتوای نوار کناری (قابل استفاده در دسکتاپ و موبایل) ----------

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
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
        toast({ title: "پوشه ساخته شد" });
        setNewFolderOpen(false);
        setNewFolderName("");
        setNewFolderColor(FOLDER_COLORS[0]);
      })
      .catch(() => toast({ title: "ساخت پوشه ناموفق بود", variant: "destructive" }));
  };

  const confirmRenameConversation = () => {
    const title = renameValue.trim();
    if (!renameTarget || !title) return;
    renameConversation(renameTarget.id, title)
      .then(() => setRenameTarget(null))
      .catch(() => toast({ title: "تغییر نام ناموفق بود", variant: "destructive" }));
  };

  const confirmRenameFolder = () => {
    const name = folderRenameValue.trim();
    if (!folderRenameTarget || !name) return;
    renameFolder(folderRenameTarget.id, name)
      .then(() => setFolderRenameTarget(null))
      .catch(() => toast({ title: "تغییر نام پوشه ناموفق بود", variant: "destructive" }));
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
      <div className="space-y-3 p-3">
        <Button className="h-11 w-full gap-2 text-sm font-semibold" onClick={handleNewChat}>
          <Plus className="h-4 w-4" aria-hidden />
          گفتگوی جدید
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در گفتگوها…"
            aria-label="جستجو در گفتگوها"
            className="h-10 ps-9"
          />
        </div>
      </div>

      <nav aria-label="فهرست گفتگوها" className="xenon-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {loadingSidebar ? (
          <div className="space-y-2" aria-label="در حال بارگذاری">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">هنوز گفتگویی ندارید</p>
            <p className="text-xs text-muted-foreground/70">برای شروع، «گفتگوی جدید» را بزنید</p>
          </div>
        ) : showNoResults ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">نتیجه‌ای برای این جست‌وجو یافت نشد</p>
        ) : (
          <>
            {pinned.length > 0 ? (
              <section aria-label="پین‌شده">
                <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Pin className="h-3 w-3" aria-hidden />
                  پین‌شده
                </h3>
                <ul className="space-y-0.5">{pinned.map(renderRow)}</ul>
              </section>
            ) : null}

            <section aria-label="پوشه‌ها">
              <h3 className="mb-1 flex items-center justify-between px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderIcon className="h-3 w-3" aria-hidden />
                  پوشه‌ها
                </span>
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(true)}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[0.7rem] font-normal normal-case text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="ساخت پوشه جدید"
                >
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden />
                  پوشه جدید
                </button>
              </h3>
              {folders.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground/70">برای نظم بیشتر، گفتگوها را دسته‌بندی کنید</p>
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

            <section aria-label="گفتگوها">
              {ungrouped.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground/70">گفتگویی بدون پوشه وجود ندارد</p>
              ) : (
                (["today", "yesterday", "older"] as DateGroup[]).map((group) =>
                  grouped[group].length > 0 ? (
                    <div key={group} className="mb-3">
                      <h4 className="mb-1 px-2 text-[0.7rem] font-medium text-muted-foreground/80">{GROUP_LABELS[group]}</h4>
                      <ul className="space-y-0.5">{grouped[group].map(renderRow)}</ul>
                    </div>
                  ) : null
                )
              )}
            </section>
          </>
        )}
      </nav>

      {/* گفتگوی تغییر نام */}
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر نام گفتگو</DialogTitle>
            <DialogDescription>نام تازه‌ای برای این گفتگو وارد کنید.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="عنوان گفتگو"
            aria-label="عنوان تازه گفتگو"
            onKeyDown={(e) => e.key === "Enter" && confirmRenameConversation()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              انصراف
            </Button>
            <Button onClick={confirmRenameConversation} disabled={!renameValue.trim()}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی حذف گفتگو */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف گفتگو</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleteTarget?.title}» مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                removeConversation(deleteTarget.id).catch(() => undefined);
                setDeleteTarget(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* گفتگوی تغییر نام پوشه */}
      <Dialog open={Boolean(folderRenameTarget)} onOpenChange={(open) => !open && setFolderRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر نام پوشه</DialogTitle>
            <DialogDescription>نام تازه‌ای برای این پوشه وارد کنید.</DialogDescription>
          </DialogHeader>
          <Input
            value={folderRenameValue}
            onChange={(e) => setFolderRenameValue(e.target.value)}
            placeholder="نام پوشه"
            aria-label="نام تازه پوشه"
            onKeyDown={(e) => e.key === "Enter" && confirmRenameFolder()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderRenameTarget(null)}>
              انصراف
            </Button>
            <Button onClick={confirmRenameFolder} disabled={!folderRenameValue.trim()}>
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* گفتگوی حذف پوشه */}
      <AlertDialog open={Boolean(folderDeleteTarget)} onOpenChange={(open) => !open && setFolderDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف پوشه</AlertDialogTitle>
            <AlertDialogDescription>
              پوشه «{folderDeleteTarget?.name}» حذف می‌شود. گفتگوهای داخل آن حذف نمی‌شوند و بدون پوشه باقی می‌مانند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!folderDeleteTarget) return;
                removeFolder(folderDeleteTarget.id).catch(() => undefined);
                setFolderDeleteTarget(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* گفتگوی ساخت پوشه */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>پوشه جدید</DialogTitle>
            <DialogDescription>برای دسته‌بندی گفتگوها یک پوشه بسازید.</DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="نام پوشه"
            aria-label="نام پوشه جدید"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <div className="flex items-center gap-2" role="radiogroup" aria-label="رنگ پوشه">
            {FOLDER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={newFolderColor === color}
                aria-label={`رنگ ${color}`}
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
              انصراف
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              ساخت پوشه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- نوار کناری دسکتاپ ----------

export function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-e bg-sidebar lg:flex lg:w-80">
      <SidebarContent />
    </aside>
  );
}
