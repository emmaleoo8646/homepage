"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  Home,
  BrainCircuit,
  Paintbrush,
  CodeXml,
  Globe2,
  Plus,
  Settings as SettingsIcon,
  Bell,
  Search,
  Sun,
  ChevronDown,
  NotebookPen,
  Send,
  Image as ImageIcon,
  Quote,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCw,
  Check,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  X,
  GripVertical,
  Monitor,
  Moon,
  FolderPlus,
  FolderOpen,
  FolderInput,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { IconImage } from "@/components/bookmark-icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import {
  iconColors,
  initialState,
  migrateToV2,
  bookmarkSchema,
  safeUrl,
  categoryNames,
  categoryIds,
  homeSlots,
  wallpapers,
  quotes,
  hotSources,
  STORAGE_KEY,
  type HomeState,
  type Bookmark,
  type Folder,
  type CategoryId,
  type Settings,
} from "@/lib/home-data";
import {
  applyMergeToState,
  applyUndoMergeToState,
  applyBookmarkIntoFolderToState,
  applyUndoBookmarkIntoFolderToState,
  applyUngroupToState,
  applyUndoUngroupToState,
  applyRemoveFolderToState,
  applyRenameFolderToState,
  applyNewFolderToState,
  snapshotMergeUndo,
  makeFolder,
  findBookmark,
  findFolder,
} from "@/lib/folder-actions";
import {
  applyAppendBookmarkToState,
  applyUpdateBookmarkToState,
  applyRemoveBookmarkToState,
  applyUndoRemoveBookmarkToState,
  applyReorderToState,
} from "@/lib/bookmark-actions";
import { SyncPanel } from "@/components/sync-panel";
import { useCachedSyncUser } from "@/lib/sync-state";
import {
  FolderMergeDialog,
  type MergeDraft,
} from "@/components/folder-merge-dialog";
import { WeatherTile } from "@/components/weather-tile";
import { WeatherDetail } from "@/components/weather-detail";
import { layoutMembers } from "@/lib/folder-layout";
import { isBundledIcon } from "@/lib/bookmark-icons";
import { readImageFile } from "@/lib/icon-upload";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const categories = [
  { id: "home", name: "首页", Icon: Home },
  { id: "ai", name: "AI", Icon: BrainCircuit },
  { id: "design", name: "设计", Icon: Paintbrush },
  { id: "code", name: "编程", Icon: CodeXml },
  { id: "discover", name: "发现", Icon: Globe2 },
] as const;
type Panel =
  | "bookmark"
  | "todo"
  | "note"
  | "calendar"
  | "wallpaper"
  | "settings"
  | "quote"
  | "folder"
  | "weather"
  | "transfer"
  | "about"
  | null;
const titles: Record<Exclude<Panel, null>, string> = {
  bookmark: "网址管理",
  todo: "待办提醒",
  note: "本地笔记",
  calendar: "日历",
  wallpaper: "壁纸库",
  settings: "设置",
  quote: "每日一言",
  folder: "娱乐",
  weather: "天气",
  transfer: "文件快传",
  about: "关于起始页",
};
function uid() {
  return crypto.randomUUID();
}
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="form-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Tile({
  name,
  position,
  children,
  style,
}: {
  name: string;
  position: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={`tile ${position}`} style={style}>
      <div className="tile-surface">{children}</div>
      <span className="tile-label">{name}</span>
    </div>
  );
}
function lunar(date: Date) {
  try {
    const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    }).formatToParts(date);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = Number(parts.find((p) => p.type === "day")?.value ?? 0);
    const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const label =
      day < 10
        ? "初" + digits[day]
        : day === 10
          ? "初十"
          : day < 20
            ? "十" + digits[day - 10]
            : day === 20
              ? "二十"
              : day < 30
                ? "廿" + digits[day - 20]
                : "三十";
    return `${month}${month.endsWith("月") ? "" : "月"}${label}`;
  } catch {
    return "";
  }
}
function monthDays(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function localDay(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

type RegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelContext = {
  registerTool: (
    tool: RegisteredTool,
    opts: { signal: AbortSignal },
  ) => unknown;
};

export default function Page() {
  const [data, setData] = useState<HomeState>(initialState),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(false),
    [category, setCategory] = useState<CategoryId>("home"),
    [panel, setPanel] = useState<Panel>(null),
    [query, setQuery] = useState(""),
    [now, setNow] = useState<Date | null>(null),
    [month, setMonth] = useState<{ year: number; month: number } | null>(null),
    [selectedDay, setSelectedDay] = useState<Date | null>(null),
    [source, setSource] = useState("weibo"),
    [todoText, setTodoText] = useState(""),
    [todoFilter, setTodoFilter] = useState("all"),
    [editing, setEditing] = useState<Bookmark | null>(null),
    [dragged, setDragged] = useState<string | null>(null),
    [dragOver, setDragOver] = useState<string | null>(null),
    [formName, setFormName] = useState(""),
    [formUrl, setFormUrl] = useState(""),
    [formCategory, setFormCategory] = useState<CategoryId>("home"),
    [formFolder, setFormFolder] = useState("none"),
    [formIcon, setFormIcon] = useState(""),
    [formError, setFormError] = useState(""),
    [mergeOpen, setMergeOpen] = useState(false),
    [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null),
    [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const syncUser = useCachedSyncUser();
  const stateRef = useRef(data);
  stateRef.current = data;
  const searchRef = useRef<HTMLInputElement>(null);
  const update = useCallback(
    (fn: (d: HomeState) => HomeState) => setData(fn),
    [],
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const m = migrateToV2(JSON.parse(raw));
        if (m.ok) setData(m.state);
        else {
          setStorageError(true);
          toast.error("保存的数据无法读取，已载入默认页面；原数据尚未覆盖。");
        }
      }
    } catch {
      setStorageError(true);
      toast.error("浏览器存储不可用，修改仅在本次打开期间保留。");
    }
    setReady(true);
    const date = new Date();
    setNow(date);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedDay(date);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!ready || storageError) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      setStorageError(true);
      toast.error("无法保存到此浏览器，修改仍可继续使用。");
    }
  }, [data, ready, storageError]);
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      data.settings.theme === "dark",
    );
  }, [data.settings.theme]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !panel
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panel]);
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const createBookmark = useCallback(
    (b: Bookmark) => {
      const parsed = bookmarkSchema.parse(b);
      update((d) => applyAppendBookmarkToState(d, parsed));
    },
    [update],
  );
  const addTodo = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || clean.length > 120)
        throw new Error("待办内容应为 1–120 个字符");
      const item = { id: uid(), text: clean, done: false };
      update((d) => ({ ...d, todos: [...d.todos, item] }));
      return item;
    },
    [update],
  );
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const tools: RegisteredTool[] = [
      {
        name: "read_homepage",
        title: "读取起始页",
        description:
          "Read categories, bookmarks, todos, note and settings from this browser.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({ categories: categoryNames, ...stateRef.current }),
      },
      {
        name: "create_bookmark",
        title: "添加网址",
        description:
          "Save an http or https bookmark to the selected category in this browser.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            category: { type: "string", enum: categoryIds },
          },
          required: ["name", "url", "category"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          const i = input as Record<string, unknown>;
          const item = bookmarkSchema.parse({
            id: uid(),
            name: i.name,
            url: i.url,
            category: i.category,
            icon: "",
            folder: null,
          });
          flushSync(() => createBookmark(item));
          return item;
        },
      },
      {
        name: "create_todo",
        title: "添加待办",
        description: "Save a new incomplete todo in this browser.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1, maxLength: 120 },
          },
          required: ["text"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          if (!input || typeof (input as { text?: unknown }).text !== "string")
            throw new Error("text is required");
          let item;
          flushSync(() => {
            item = addTodo((input as { text: string }).text);
          });
          return item;
        },
      },
      {
        name: "select_category",
        title: "切换分类",
        description: "Show the selected bookmark category.",
        inputSchema: {
          type: "object",
          properties: { category: { type: "string", enum: categoryIds } },
          required: ["category"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          const value = (input as { category?: CategoryId })?.category;
          if (!value || !categoryIds.includes(value))
            throw new Error("Unknown category");
          flushSync(() => setCategory(value));
          return { category: value };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability. */
      }
    }
    return () => controller.abort();
  }, [addTodo, createBookmark]);
  const bookmarkList = data.bookmarks.filter(
    (b) => b.category === category && b.folder === null,
  );
  const folderList = data.folders.filter((f) => f.category === category);
  // The home "娱乐" folder is no longer a special widget slot — it shows
  // up alongside every other folder via `visibleItems` and `renderFolder`,
  // so no separate home-folder computation is needed here.
  const remaining = data.todos.filter((t) => !t.done);
  const quote = quotes[data.quoteIndex % quotes.length];
  const hot = hotSources.find((s) => s.id === source) ?? hotSources[0];
  const wallpaper = wallpapers.find((w) => w.id === data.settings.wallpaper);
  function openBookmark(b: Bookmark | null = null, folder = "none") {
    setEditing(b);
    setFormName(b?.name ?? "");
    setFormUrl(b?.url ?? "");
    setFormCategory(b?.category ?? category);
    setFormFolder(b?.folder ?? folder);
    setFormIcon(b?.icon ?? "");
    setFormError("");
    setPanel("bookmark");
  }
  function saveBookmark(e: FormEvent) {
    e.preventDefault();
    const name = formName.trim();
    let url = formUrl.trim();
    if (url && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) url = `https://${url}`;
    const allowedFolderIds = new Set(
      data.folders
        .filter((f) => f.category === formCategory)
        .map((f) => f.id),
    );
    const parsed = bookmarkSchema.safeParse({
      id: editing?.id ?? uid(),
      name,
      url,
      category: formCategory,
      folder:
        formFolder !== "none" && allowedFolderIds.has(formFolder)
          ? formFolder
          : null,
      icon: formIcon || editing?.icon || "",
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    if (editing)
      update((d) =>
        applyUpdateBookmarkToState(d, editing.id, parsed.data),
      );
    else createBookmark(parsed.data);
    setPanel(null);
    toast.success(editing ? "网址已更新" : "网址已添加");
  }
  function removeBookmark(b: Bookmark) {
    const index = data.bookmarks.findIndex((v) => v.id === b.id);
    update((d) => applyRemoveBookmarkToState(d, b.id));
    toast("网址已删除", {
      action: {
        label: "撤销",
        onClick: () =>
          update((d) => applyUndoRemoveBookmarkToState(d, b, index)),
      },
    });
  }
  function reorder(from: string, to: string) {
    update((d) => applyReorderToState(d, from, to));
  }
  function moveBookmark(b: Bookmark, direction: number) {
    const list = data.bookmarks.filter(
      (v) => v.category === b.category && v.folder === b.folder,
    );
    const index = list.findIndex((v) => v.id === b.id);
    const target = list[index + direction];
    if (target) reorder(b.id, target.id);
  }
  // Resolve a folder id to its Folder entity (or null if it has been deleted).
  const folderOf = (id: string | null | undefined) =>
    id ? data.folders.find((f) => f.id === id) ?? null : null;
  function openFolder(id: string) {
    setOpenFolderId(id);
    setPanel("folder");
  }
  function closeFolder() {
    setOpenFolderId(null);
    setPanel(null);
  }
  // Drop two bookmarks into a single folder. The semantics are predictable:
  // source is moved out of any old folder it was in, and both source and target
  // are written to point at `folderId`. If `folderId` references a brand-new
  // folder, the caller is responsible for creating it before calling this.
  // All folder/DnD state transforms live in `lib/folder-actions.ts` as
  // pure \`(state, ...) -> state\` functions (unit-tested in
  // `lib/folder-actions.test.ts`). The wrappers here just compose them
  // with React's \`setData\` setter and sonner's \`toast\`.
  function mergeWithToast(
    sourceId: string,
    targetId: string,
    folderId: string,
    folderName: string,
  ) {
    const undo = snapshotMergeUndo(data, sourceId, targetId);
    update((d) => applyMergeToState(d, sourceId, targetId, folderId));
    toast(`已合并到「${folderName}」`, {
      action: {
        label: "撤销",
        onClick: () =>
          update((d) =>
            applyUndoMergeToState(
              d,
              sourceId,
              targetId,
              undo.sourcePrev,
              undo.targetPrev,
              undo.prevFolders,
            ),
          ),
      },
    });
  }
  // Drag a folder member out into empty space → set its `folder` to null so
  // it falls out of the group and renders as a standalone bookmark again.
  // Undo mirrors `mergeWithToast`: snapshotted `prevFolder` is replayable.
  function ungroupBookmark(id: string) {
    const before = findBookmark(data, id);
    if (!before || !before.folder) return;
    const prevFolder = before.folder;
    update((d) => applyUngroupToState(d, id));
    toast(`「${before.name}」已移出分组`, {
      action: {
        label: "撤销",
        onClick: () => update((d) => applyUndoUngroupToState(d, id, prevFolder)),
      },
    });
  }
  function openMerge(source: Bookmark, target: Bookmark) {
    if (source.category !== target.category) {
      toast.error("不能跨分类合并");
      return;
    }
    if (source.id === target.id) return;
    const targetFolder = folderOf(target.folder);
    setMergeDraft({ source, target, targetFolder, category: source.category });
    setMergeOpen(true);
    setPanel(null);
  }
  function confirmMerge(
    input:
      | { mode: "new"; name: string }
      | { mode: "join"; folderId: string },
  ) {
    if (!mergeDraft) return;
    if (input.mode === "new") {
      const folderId = uid();
      const folder = makeFolder(folderId, input.name, mergeDraft.category);
      update((d) => applyNewFolderToState(d, folder));
      mergeWithToast(
        mergeDraft.source.id,
        mergeDraft.target.id,
        folderId,
        input.name,
      );
    } else {
      const folder = findFolder(data, input.folderId);
      if (!folder) {
        setMergeOpen(false);
        setMergeDraft(null);
        toast.error("原分组已被删除");
        return;
      }
      mergeWithToast(
        mergeDraft.source.id,
        mergeDraft.target.id,
        folder.id,
        folder.name,
      );
    }
    setMergeOpen(false);
    setMergeDraft(null);
  }
  function removeFolder(folderId: string) {
    const folder = folderOf(folderId);
    if (!folder) return;
    update((d) => applyRemoveFolderToState(d, folderId));
    toast.success(`「${folder.name}」已删除，成员网址已恢复到分类网格`);
  }
  function renameFolder(folderId: string, name: string) {
    if (!name.trim()) return;
    update((d) => applyRenameFolderToState(d, folderId, name));
  }
  function submitTodo(e: FormEvent) {
    e.preventDefault();
    try {
      addTodo(todoText);
      setTodoText("");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function removeTodo(id: string) {
    const item = data.todos.find((t) => t.id === id);
    if (!item) return;
    update((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));
    toast("待办已删除", {
      action: {
        label: "撤销",
        onClick: () =>
          update((d) => ({
            ...d,
            todos: d.todos.some((t) => t.id === id)
              ? d.todos
              : [...d.todos, item],
          })),
      },
    });
  }
  function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      searchRef.current?.focus();
      return;
    }
    const urls = {
      baidu: "https://www.baidu.com/s?wd=",
      bing: "https://www.bing.com/search?q=",
      google: "https://www.google.com/search?q=",
    };
    window.open(
      urls[data.settings.engine] + encodeURIComponent(q),
      "_blank",
      "noopener,noreferrer",
    );
  }
  async function copyQuote() {
    try {
      await navigator.clipboard.writeText(`${quote.text} — ${quote.author}`);
      toast.success("已复制一言");
    } catch {
      toast.error("复制不可用，请选中文字复制。");
    }
  }
  function shiftMonth(delta: number) {
    if (!month) return;
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }
  const dateLabel = now
    ? `${now.getMonth() + 1}月${now.getDate()}日 · ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()]}`
    : "";
  function renderBookmark(b: Bookmark, index: number, inFolder = false) {
    const position =
      category === "home" &&
      data.settings.showWidgets &&
      !inFolder &&
      index < homeSlots.length
        ? `app-${homeSlots[index]}`
        : "";
    const folder = folderOf(b.folder);
    return (
      <div
        key={b.id}
        className={`tile app-tile ${position} ${dragOver === b.id ? "drop-target" : ""}`}
        draggable
        onDragStart={(e) => {
          setDragged(b.id);
          e.dataTransfer.setData("text/plain", b.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragged(null);
          setDragOver(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragged) setDragOver(b.id);
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          // Stop the section-level handler from running after a tile has
          // claimed the drop (so dragging onto a tile doesn't also ungroup
          // the source if `stopPropagation` accidentally fell through).
          e.stopPropagation();
          const from = dragged ?? e.dataTransfer.getData("text/plain");
          setDragged(null);
          setDragOver(null);
          if (!from || from === b.id) return;
          const source = data.bookmarks.find((v) => v.id === from);
          if (!source) return;
          if (source.category !== b.category) {
            toast.error("不能跨分类合并");
            return;
          }
          openMerge(source, b);
        }}
      >
        <a
          className="app-icon"
          style={{ background: iconColors[b.icon] ?? "#fff" }}
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`打开${b.name}`}
        >
          <IconImage icon={b.icon} name={b.name} url={b.url} />
        </a>
        <span className="tile-label">{b.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="bookmark-more" aria-label={`管理${b.name}`}>
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => openBookmark(b)}>
              <Pencil />
              编辑网址
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => moveBookmark(b, -1)}>
              <ArrowUp />
              向前移动
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => moveBookmark(b, 1)}>
              <ArrowDown />
              向后移动
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const other = data.bookmarks.find(
                  (v) =>
                    v.category === b.category &&
                    v.id !== b.id &&
                    v.folder !== b.folder,
                );
                if (!other) {
                  toast.error("该分类下至少需要两个网址才能合并");
                  return;
                }
                openMerge(other, b);
              }}
            >
              <FolderPlus />
              合并到新分组
            </DropdownMenuItem>
            {folder && (
              <DropdownMenuItem
                onSelect={() => {
                  const other = data.bookmarks.find(
                    (v) =>
                      v.id !== b.id &&
                      v.folder === b.folder &&
                      v.category === b.category,
                  );
                  if (!other) {
                    toast.error("同分组内没有其他可合并的网址");
                    return;
                  }
                  openMerge(other, b);
                }}
              >
                <FolderInput />
                合并到「{folder.name}」
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => removeBookmark(b)}
            >
              <Trash2 />
              删除网址
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  function renderFolder(folder: Folder) {
    const members = data.bookmarks.filter((b) => b.folder === folder.id);
    const layout = layoutMembers(members);

    // Inner .folder-icons grid template — what N looks like inside the box.
    const innerTemplate =
      layout.mode === "1x1"
        ? { gridTemplateColumns: "60px", gridTemplateRows: "60px" }
        : layout.mode === "1x2"
          ? { gridTemplateColumns: "repeat(2, 60px)" }
          : {
              gridTemplateColumns: "repeat(2, 60px)",
              gridTemplateRows: "repeat(2, 60px)",
            };

    // Outer <Tile> grid placement — covers the right cells in the home-grid /
    // bookmark-grid. Inline style overrides `.folder-tile-inline` defaults so a
    // 2-member folder is a 1×2 rectangle instead of a square with empty cells.
    const tileBoxSize =
      layout.mode === "1x1"
        ? { gridColumn: "span 1", gridRow: "span 1" }
        : layout.mode === "1x2"
          ? { gridColumn: "span 2", gridRow: "span 1" }
          : { gridColumn: "span 2", gridRow: "span 2" };

    return (
      <Tile
        key={folder.id}
        name={folder.name}
        position={`folder-tile-inline ${dragOver === folder.id ? "drop-target" : ""}`}
        style={tileBoxSize}
      >
        <button
          className="widget folder-card"
          onClick={() => openFolder(folder.id)}
          aria-label={`打开${folder.name}分组`}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragged) setDragOver(folder.id);
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            // Stop the section's onDrop from also firing when a folder tile
            // already handled the merge flow (without this, dropping onto a
            // folder tile would also try to ungroup the source).
            e.stopPropagation();
            const from = dragged ?? e.dataTransfer.getData("text/plain");
            setDragged(null);
            setDragOver(null);
            if (!from) return;
            const source = data.bookmarks.find((v) => v.id === from);
            if (!source) return;
            if (source.category !== folder.category) {
              toast.error("不能跨分类合并");
              return;
            }
            if (members.some((m) => m.id === source.id)) {
              toast("已在此分组中");
              return;
            }
            // Drop onto a folder → direct merge, no merge dialog. Mirrors the
            // cover-icon → folder path so users can rearrange groups by
            // dragging without first opening the folder panel.
            const prevFolder = source.folder ?? null;
            update((d) =>
              applyBookmarkIntoFolderToState(d, source.id, folder.id),
            );
            toast(`「${source.name}」已加入「${folder.name}」`, {
              action: {
                label: "撤销",
                onClick: () =>
                  update((d) =>
                    applyUndoBookmarkIntoFolderToState(
                      d,
                      source.id,
                      prevFolder,
                    ),
                  ),
              },
            });
          }}
        >
          <div className="folder-icons" style={innerTemplate}>
            {layout.cells.map((cell, ci) => {
              if (cell.kind === "single") {
                const bm = cell.bookmark;
                // Empty placeholder cells (N=0) stay non-draggable so the
                // click still opens the folder instead of starting a drag.
                return (
                  <div
                    className="folder-icon"
                    style={{
                      background:
                        iconColors[bm?.icon ?? ""] ?? "#fff",
                    }}
                    key={ci}
                    draggable={bm != null}
                    onDragStart={
                      bm
                        ? (e) => {
                            setDragged(bm.id);
                            e.dataTransfer.setData("text/plain", bm.id);
                            e.dataTransfer.effectAllowed = "move";
                          }
                        : undefined
                    }
                    onDragEnd={
                      bm
                        ? () => {
                            setDragged(null);
                            setDragOver(null);
                          }
                        : undefined
                    }
                  >
                    {bm ? (
                      <IconImage
                        icon={bm.icon}
                        name={bm.name}
                        url={bm.url}
                      />
                    ) : (
                      <Plus size={30} />
                    )}
                  </div>
                );
              }
              return (
                <div
                  className="folder-icon folder-icon-stack"
                  style={{ background: "rgba(255,255,255,0.18)" }}
                  key={ci}
                >
                  {cell.bookmarks.map((m) => (
                    <div
                      className="folder-icon-stack-cell"
                      style={{
                        background: iconColors[m.icon] ?? "#fff",
                      }}
                      key={m.id}
                      draggable
                      onDragStart={(e) => {
                        setDragged(m.id);
                        e.dataTransfer.setData("text/plain", m.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDragOver(null);
                      }}
                    >
                      <IconImage icon={m.icon} name={m.name} url={m.url} />
                    </div>
                  ))}
                  {cell.overflow > 0 && (
                    <span className="folder-overflow-badge">
                      +{cell.overflow}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="bookmark-more"
              aria-label={`管理${folder.name}分组`}
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => openFolder(folder.id)}>
              <FolderOpen />
              打开分组
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => removeFolder(folder.id)}
            >
              <Trash2 />
              删除分组
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Tile>
    );
  }
  type VisibleItem =
    | { kind: "folder"; folder: Folder }
    | { kind: "bookmark"; bookmark: Bookmark };
  // The home folder is treated like any other folder: rendered through the
  // generic visibleItems pipeline so it shows up as a regular folder tile in
  // both widget and no-widget home layouts (no special-cased position).
  const visibleItems: VisibleItem[] = [
    ...folderList.map<VisibleItem>((f) => ({ kind: "folder", folder: f })),
    ...bookmarkList.map<VisibleItem>((b) => ({ kind: "bookmark", bookmark: b })),
  ];
  return (
    <SidebarProvider className="site-wrapper">
      <main className="homepage">
        <div
          className="wallpaper"
          style={{
            backgroundImage: wallpaper ? `url('${wallpaper.src}')` : "none",
            backgroundColor: data.settings.color,
          }}
        />
        {wallpaper && (
          <img
            className="wallpaper-health"
            src={wallpaper.src}
            alt=""
            onError={() => {
              setSetting("wallpaper", "solid");
              toast.error("壁纸未能加载，已切换为纯色背景。");
            }}
          />
        )}
        <div
          className="wallpaper-mask"
          style={{ background: `rgba(3,10,22,${data.settings.overlay / 100})` }}
        />
        <Sidebar collapsible="none" className="side-nav" aria-label="网址分类">
          <nav className="category-nav">
            {categories.map(({ id, name, Icon }) => (
              <button
                className={category === id ? "nav-item selected" : "nav-item"}
                aria-current={category === id ? "page" : undefined}
                key={id}
                onClick={() => setCategory(id)}
              >
                <Icon size={22} />
                <span>{name}</span>
              </button>
            ))}
            <button
              className="nav-item add-nav"
              aria-label="添加网址"
              onClick={() => openBookmark()}
            >
              <Plus size={28} />
            </button>
          </nav>
          <div className="nav-bottom">
            <button aria-label="关于起始页" onClick={() => setPanel("about")}>
              <Bell size={21} />
            </button>
            <button aria-label="设置" onClick={() => setPanel("settings")}>
              <SettingsIcon size={23} />
            </button>
          </div>
        </Sidebar>
        <div className="page-content">
          <header
            className={`search-area ${data.settings.showTime ? "has-clock" : ""}`}
          >
            {data.settings.showTime && (
              <button
                className="clock"
                onClick={() => setPanel("calendar")}
                aria-label="时间和日历"
              >
                <strong>
                  {now?.toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }) ?? "--:--"}
                </strong>
                <span>
                  {dateLabel} · {now ? lunar(now) : ""}
                </span>
              </button>
            )}
            <form className="search-box" onSubmit={search}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="engine-button"
                    aria-label="选择搜索引擎"
                  >
                    <span className={`engine-mark ${data.settings.engine}`}>
                      {data.settings.engine === "baidu" ? (
                        <span className="baidu-mark">du</span>
                      ) : data.settings.engine === "google" ? (
                        "G"
                      ) : (
                        "b"
                      )}
                    </span>
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {[
                    { id: "baidu", name: "百度" },
                    { id: "bing", name: "必应" },
                    { id: "google", name: "Google" },
                  ].map((e) => (
                    <DropdownMenuItem
                      key={e.id}
                      onSelect={() =>
                        setSetting("engine", e.id as Settings["engine"])
                      }
                    >
                      {e.name}
                      {data.settings.engine === e.id && <Check size={15} />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="搜索"
                autoComplete="off"
              />
              <button className="search-submit" aria-label="开始搜索">
                <Search size={23} />
              </button>
            </form>
          </header>
          <section
            className={`${category === "home" && data.settings.showWidgets ? "home-grid" : "bookmark-grid"} ${dragged && !dragOver ? "bookmark-drop-bg" : ""}`}
            aria-label={`${categoryNames[category]}网址与组件`}
            onDragOver={(e) => {
              // Required so the section receives `drop` events at all.
              // We only allow drop when a tile is in flight; tiles can
              // still claim drops themselves because they also call
              // `preventDefault` and now `stopPropagation` in their own
              // handlers.
              if (dragged) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              // tile handlers call `stopPropagation`, so reaching here
              // means the user really did drop on empty space.
              const from = e.dataTransfer.getData("text/plain");
              setDragged(null);
              setDragOver(null);
              if (!from) return;
              const source = data.bookmarks.find((b) => b.id === from);
              if (!source || !source.folder) return;
              ungroupBookmark(source.id);
            }}
          >
            {category === "home" && data.settings.showWidgets && (
              <>
                <Tile name="天气" position="weather-tile">
                  <WeatherTile onSelect={() => setPanel("weather")} />
                </Tile>
                <Tile name="热搜榜" position="hot-tile">
                  <div className="widget hot-card">
                    <Tabs value={source} onValueChange={setSource}>
                      <TabsList className="hot-tabs" aria-label="热搜来源">
                        {hotSources.map((s) => (
                          <TabsTrigger key={s.id} value={s.id}>
                            {s.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {hotSources.map((s) => (
                        <TabsContent
                          value={s.id}
                          key={s.id}
                          className="trend-list"
                        >
                          {s.items.map((v, i) => (
                            <a
                              key={v}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="rank">{i + 1}</span>
                              <span>{v}</span>
                              <small>{[128.4, 88.6, 69.4, 67.1][i]}万</small>
                            </a>
                          ))}
                        </TabsContent>
                      ))}
                    </Tabs>
                    <a
                      className="trend-note"
                      href={hot.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      示例内容 · 查看真实热搜
                    </a>
                  </div>
                </Tile>
                <Tile name="壁纸库" position="wallpaper-tile">
                  <button
                    onClick={() => setPanel("wallpaper")}
                    className="widget wallpaper-card"
                    style={{ backgroundImage: "url('/assets/mountain.jpg')" }}
                  >
                    <span>山野之间，遇见自由</span>
                    <ImageIcon size={18} />
                  </button>
                </Tile>
                <Tile name="待办提醒" position="todo-tile">
                  <button
                    onClick={() => setPanel("todo")}
                    className="widget todo-card"
                  >
                    <div className="todo-heading">
                      <strong>今日待办</strong>
                      <b>{remaining.length}</b>
                    </div>
                    {remaining.slice(0, 3).map((t) => (
                      <div className="todo-preview" key={t.id}>
                        <span className="todo-circle" />
                        {t.text}
                      </div>
                    ))}
                    {remaining.length === 0 && (
                      <p className="todo-empty">
                        <Check size={20} />
                        全部待办已完成
                      </p>
                    )}
                    <div className="todo-bottom">
                      <Plus size={14} /> 添加待办
                    </div>
                  </button>
                </Tile>
                <Tile name="日历" position="calendar-tile">
                  <button
                    onClick={() => setPanel("calendar")}
                    className="widget calendar-card"
                  >
                    <span className="calendar-day">
                      {now?.getDate() ?? "—"}
                    </span>
                    <span>
                      {now
                        ? [
                            "星期日",
                            "星期一",
                            "星期二",
                            "星期三",
                            "星期四",
                            "星期五",
                            "星期六",
                          ][now.getDay()]
                        : "日历"}
                      <small>
                        {now
                          ? `${now.getFullYear()}年 ${now.getMonth() + 1}月`
                          : ""}
                      </small>
                      <small>{now ? lunar(now) : ""}</small>
                    </span>
                  </button>
                </Tile>
                {data.settings.showQuote && (
                  <Tile name="每日一言" position="quote-tile">
                    <button
                      onClick={() => setPanel("quote")}
                      className="widget quote-card"
                    >
                      <Quote size={19} />
                      <p>{quote.text}</p>
                      <small>— {quote.author}</small>
                    </button>
                  </Tile>
                )}
                <Tile name="文件快传" position="transfer-tile">
                  <button
                    onClick={() => setPanel("transfer")}
                    className="widget transfer-card"
                  >
                    <span>
                      <Send size={21} />
                    </span>
                    <strong>文件快传</strong>
                  </button>
                </Tile>
                <Tile name="本地笔记" position="note-tile">
                  <button
                    onClick={() => setPanel("note")}
                    className="widget note-card"
                  >
                    <NotebookPen size={27} />
                    <div>
                      <strong>Notebook</strong>
                      <small>{data.note ? "继续编辑" : "新建笔记"}</small>
                    </div>
                  </button>
                </Tile>
                <div className="tile app-tile app-about">
                  <button
                    className="app-icon"
                    onClick={() => setPanel("about")}
                    aria-label="关于起始页"
                  >
                    <IconImage icon="HiTab.png" name="HiTab" />
                  </button>
                  <span className="tile-label">关于起始页</span>
                </div>
              </>
            )}
            {visibleItems.map((item) =>
              item.kind === "folder" ? (
                renderFolder(item.folder)
              ) : (
                renderBookmark(
                  item.bookmark,
                  bookmarkList.indexOf(item.bookmark),
                )
              ),
            )}
            <div
              className={`tile add-tile ${category !== "home" || !data.settings.showWidgets ? "auto-position" : ""}`}
            >
              <button
                className="add-icon"
                aria-label="添加网址"
                onClick={() => openBookmark()}
              >
                <Plus size={38} />
              </button>
              <span className="tile-label">添加</span>
            </div>
            {category === "home" && !data.settings.showWidgets && (
              <>
                <div className="tile">
                  <button
                    className="app-icon"
                    onClick={() => setPanel("note")}
                    aria-label="本地笔记"
                  >
                    <NotebookPen color="#577dc6" />
                  </button>
                  <span className="tile-label">本地笔记</span>
                </div>
              </>
            )}
          </section>
          {storageError && (
            <p className="storage-warning" role="status">
              浏览器存储不可用，当前修改尚未保存。
            </p>
          )}
        </div>
        <footer>
          ©{now?.getFullYear() ?? 2026} ·{" "}
          <span>
            {storageError
              ? "数据仅本次打开期间保留"
              : syncUser
              ? "数据保存在此浏览器，已同步到云端"
              : "数据保存在此浏览器"}
          </span>
        </footer>
        <Dialog
          open={panel !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPanel(null);
              setOpenFolderId(null);
            }
          }}
        >
          <DialogContent
            className={`hitab-dialog ${panel === "settings" || panel === "wallpaper" ? "wide-dialog" : ""}`}
            showCloseButton={false}
          >
            <div className="modal-header">
              <DialogTitle>
                {panel === "folder"
                  ? folderOf(openFolderId)?.name ?? titles.folder
                  : panel
                    ? titles[panel]
                    : ""}
                {panel === "bookmark" && (
                  <span> · {editing ? "编辑网址" : "添加网址"}</span>
                )}
              </DialogTitle>
              <DialogClose asChild>
                <button className="close-button" aria-label="关闭">
                  <X size={20} />
                </button>
              </DialogClose>
            </div>
            <DialogDescription className="sr-only">
              {panel === "bookmark"
                ? "添加或编辑网址名称、链接及分类。"
                : "个人起始页设置与组件"}
            </DialogDescription>
            <div className="modal-body">
              {panel === "bookmark" && (
                <form onSubmit={saveBookmark} className="bookmark-form">
                  <label htmlFor="bookmark-name">名称</label>
                  <input
                    id="bookmark-name"
                    autoFocus
                    maxLength={40}
                    placeholder="例如：我的常用网站"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                  <label htmlFor="bookmark-url">网址</label>
                  <input
                    id="bookmark-url"
                    placeholder="https://example.com"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    inputMode="url"
                  />
                  <label>图标</label>
                  <div className="icon-upload-row">
                    <Avatar className="icon-preview">
                      {(() => {
                        const previewSrc = formIcon || (editing?.icon ?? "");
                        if (!previewSrc) {
                          return (
                            <AvatarFallback>
                              {editing?.name?.slice(0, 1) || "?"}
                            </AvatarFallback>
                          );
                        }
                        const src = isBundledIcon(previewSrc)
                          ? `/assets/${previewSrc}`
                          : previewSrc;
                        return <AvatarImage src={src} alt="" />;
                      })()}
                    </Avatar>
                    <input
                      id="bookmark-icon-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="bookmark-file-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error("请选择小于 2MB 的图片");
                          return;
                        }
                        try {
                          const dataUrl = await readImageFile(file);
                          setFormIcon(dataUrl);
                          toast.success(
                            `图标已应用（${Math.round(dataUrl.length / 1024)}KB）`,
                          );
                        } catch (err) {
                          toast.error(
                            `图标处理失败：${(err as Error).message ?? "未知错误"}`,
                          );
                        }
                      }}
                    />
                    {(formIcon || editing?.icon) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormIcon("")}
                      >
                        移除图标
                      </Button>
                    )}
                  </div>
                  <label>分类</label>
                  <Choice
                    label="网址分类"
                    value={formCategory}
                    onChange={(v) => {
                      setFormCategory(v as CategoryId);
                      setFormFolder("none");
                    }}
                    options={categoryIds.map((id) => ({
                      id,
                      name: categoryNames[id],
                    }))}
                  />
                  {(() => {
                    const folderOptions = data.folders
                      .filter((f) => f.category === formCategory)
                      .map((f) => ({ id: f.id, name: f.name }));
                    if (folderOptions.length === 0) return null;
                    return (
                      <>
                        <label>文件夹</label>
                        <Choice
                          label="网址文件夹"
                          value={formFolder}
                          onChange={setFormFolder}
                          options={[
                            { id: "none", name: "不放入文件夹" },
                            ...folderOptions,
                          ]}
                        />
                      </>
                    );
                  })()}
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <button className="primary-button form-submit" type="submit">
                    {editing ? "保存修改" : "添加网址"}
                  </button>
                </form>
              )}
              {panel === "todo" && (
                <div className="todo-manager">
                  <form className="inline-form" onSubmit={submitTodo}>
                    <input
                      autoFocus
                      value={todoText}
                      onChange={(e) => setTodoText(e.target.value)}
                      maxLength={120}
                      aria-label="新待办"
                      placeholder="接下来想做什么？"
                    />
                    <button
                      className="primary-button"
                      aria-label="保存待办"
                      disabled={!todoText.trim()}
                    >
                      <Plus size={19} />
                    </button>
                  </form>
                  <Tabs value={todoFilter} onValueChange={setTodoFilter}>
                    <TabsList className="filter-tabs">
                      <TabsTrigger value="all">
                        全部 {data.todos.length}
                      </TabsTrigger>
                      <TabsTrigger value="open">
                        待完成 {remaining.length}
                      </TabsTrigger>
                      <TabsTrigger value="done">
                        已完成 {data.todos.length - remaining.length}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value={todoFilter}>
                      <div className="todo-rows">
                        {data.todos
                          .filter(
                            (t) =>
                              todoFilter === "all" ||
                              (todoFilter === "open" ? !t.done : t.done),
                          )
                          .map((t) => (
                            <div
                              className={`todo-row ${t.done ? "completed" : ""}`}
                              key={t.id}
                            >
                              <Checkbox
                                aria-label={`完成${t.text}`}
                                checked={t.done}
                                onCheckedChange={(done) =>
                                  update((d) => ({
                                    ...d,
                                    todos: d.todos.map((item) =>
                                      item.id === t.id
                                        ? { ...item, done: done === true }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <span>{t.text}</span>
                              <button
                                className="subtle-button"
                                aria-label={`删除${t.text}`}
                                onClick={() => removeTodo(t.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        {data.todos.filter(
                          (t) =>
                            todoFilter === "all" ||
                            (todoFilter === "open" ? !t.done : t.done),
                        ).length === 0 && (
                          <div className="empty-state">
                            <Check size={28} />
                            <p>
                              {todoFilter === "done"
                                ? "完成一件小事，从今天开始。"
                                : "这里暂时没有待办。"}
                            </p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                  <p className="muted-note">
                    保存在当前浏览器，完成时刻由你决定。
                  </p>
                </div>
              )}
              {panel === "note" && (
                <div className="note-editor">
                  <textarea
                    autoFocus
                    aria-label="笔记内容"
                    placeholder="记下灵感、计划，或今天的小事…"
                    value={data.note}
                    maxLength={100000}
                    onChange={(e) =>
                      update((d) => ({ ...d, note: e.target.value }))
                    }
                  />
                  <div className="note-status">
                    <span>{data.note.length} 字</span>
                    <span>
                      {storageError ? "尚未保存" : "自动保存在此浏览器"}
                    </span>
                  </div>
                </div>
              )}
              {panel === "calendar" && month && now && (
                <div className="calendar-manager">
                  <div className="month-header">
                    <button aria-label="上个月" onClick={() => shiftMonth(-1)}>
                      <ChevronLeft size={20} />
                    </button>
                    <strong>
                      {month.year}年 {month.month + 1}月
                    </strong>
                    <button aria-label="下个月" onClick={() => shiftMonth(1)}>
                      <ChevronRight size={20} />
                    </button>
                    <button
                      className="today-button"
                      onClick={() => {
                        setMonth({
                          year: now.getFullYear(),
                          month: now.getMonth(),
                        });
                        setSelectedDay(now);
                      }}
                    >
                      今天
                    </button>
                  </div>
                  <div className="month-grid">
                    {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
                      <span key={w} className="week-heading">
                        {w}
                      </span>
                    ))}
                    {Array.from(
                      { length: new Date(month.year, month.month, 1).getDay() },
                      (_, i) => (
                        <span key={`blank-${i}`} />
                      ),
                    )}
                    {Array.from(
                      { length: monthDays(month.year, month.month) },
                      (_, i) => {
                        const d = new Date(month.year, month.month, i + 1);
                        return (
                          <button
                            key={i}
                            className={`${localDay(d) === localDay(now) ? "is-today" : ""} ${selectedDay && localDay(d) === localDay(selectedDay) ? "is-selected" : ""}`}
                            aria-label={`${month.year}年${month.month + 1}月${i + 1}日`}
                            onClick={() => setSelectedDay(d)}
                          >
                            <b>{i + 1}</b>
                            <small>{lunar(d).split("月")[1] ?? ""}</small>
                          </button>
                        );
                      },
                    )}
                  </div>
                  {selectedDay && (
                    <p className="selected-date">
                      {selectedDay.toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      })}{" "}
                      · 农历{lunar(selectedDay)}
                    </p>
                  )}
                </div>
              )}
              {(panel === "wallpaper" || panel === "settings") && (
                <Tabs
                  defaultValue={panel === "wallpaper" ? "wallpaper" : "basic"}
                  className="settings-tabs"
                >
                  <TabsList>
                    <TabsTrigger value="basic">基础设置</TabsTrigger>
                    <TabsTrigger value="wallpaper">壁纸</TabsTrigger>
                    <TabsTrigger value="search">搜索</TabsTrigger>
                    <TabsTrigger value="sync">数据同步</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic">
                    <section className="settings-section">
                      <h3>外观</h3>
                      <div className="theme-options">
                        {[
                          { id: "light", name: "浅色", Icon: Sun },
                          { id: "dark", name: "深色", Icon: Moon },
                        ].map(({ id, name, Icon }) => (
                          <button
                            key={id}
                            className={
                              data.settings.theme === id ? "is-active" : ""
                            }
                            onClick={() =>
                              setSetting("theme", id as Settings["theme"])
                            }
                          >
                            <Icon size={22} />
                            {name}
                            {data.settings.theme === id && <Check size={15} />}
                          </button>
                        ))}
                      </div>
                      <h3>显示内容</h3>
                      {[
                        {
                          id: "showTime",
                          name: "时间与日期",
                          hint: "在搜索框上方显示",
                        },
                        {
                          id: "showWidgets",
                          name: "首页小组件",
                          hint: "天气、热搜、待办、日历等",
                        },
                        {
                          id: "showQuote",
                          name: "每日一言",
                          hint: "首页的诗句卡片",
                        },
                      ].map((v) => (
                        <div className="setting-row" key={v.id}>
                          <div>
                            <label htmlFor={v.id}>{v.name}</label>
                            <small>{v.hint}</small>
                          </div>
                          <Switch
                            id={v.id}
                            checked={
                              data.settings[
                                v.id as "showTime" | "showWidgets" | "showQuote"
                              ]
                            }
                            onCheckedChange={(value) =>
                              setSetting(
                                v.id as
                                  "showTime" | "showWidgets" | "showQuote",
                                value,
                              )
                            }
                          />
                        </div>
                      ))}
                    </section>
                  </TabsContent>
                  <TabsContent value="wallpaper">
                    <section className="settings-section">
                      <h3>选择壁纸</h3>
                      <div className="wallpaper-options">
                        {wallpapers.map((w) => (
                          <button
                            key={w.id}
                            onClick={() => setSetting("wallpaper", w.id)}
                            className={
                              data.settings.wallpaper === w.id
                                ? "is-active"
                                : ""
                            }
                          >
                            <img src={w.src} alt={w.name} />
                            <span>
                              {w.name}
                              {data.settings.wallpaper === w.id && (
                                <Check size={15} />
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <h3>纯色背景</h3>
                      <div className="color-options">
                        {[
                          "#18324a",
                          "#282342",
                          "#194b48",
                          "#3d2b33",
                          "#61768c",
                          "#bdcde0",
                        ].map((color) => (
                          <button
                            key={color}
                            style={{ background: color }}
                            aria-label={`使用纯色 ${color}`}
                            onClick={() => {
                              update((d) => ({
                                ...d,
                                settings: {
                                  ...d.settings,
                                  wallpaper: "solid",
                                  color,
                                },
                              }));
                            }}
                          >
                            {data.settings.wallpaper === "solid" &&
                              data.settings.color === color && (
                                <Check size={19} />
                              )}
                          </button>
                        ))}
                        <label className="custom-color" title="自定义背景颜色">
                          <input
                            type="color"
                            aria-label="自定义背景颜色"
                            value={data.settings.color}
                            onChange={(e) => {
                              const color = e.target.value;
                              update((d) => ({
                                ...d,
                                settings: {
                                  ...d.settings,
                                  wallpaper: "solid",
                                  color,
                                },
                              }));
                            }}
                          />
                          <Plus size={18} />
                        </label>
                      </div>
                      <div className="overlay-label">
                        <h3 id="overlay-label">壁纸蒙层</h3>
                        <span>{data.settings.overlay}%</span>
                      </div>
                      <Slider
                        aria-labelledby="overlay-label"
                        min={0}
                        max={75}
                        step={1}
                        value={[data.settings.overlay]}
                        onValueChange={(values) =>
                          setSetting("overlay", values[0])
                        }
                      />
                      <p className="muted-note">
                        稍微调暗，让图标与文字更清晰。
                      </p>
                    </section>
                  </TabsContent>
                  <TabsContent value="search">
                    <section className="settings-section">
                      <h3>默认搜索引擎</h3>
                      <Choice
                        label="默认搜索引擎"
                        value={data.settings.engine}
                        onChange={(v) =>
                          setSetting("engine", v as Settings["engine"])
                        }
                        options={[
                          { id: "baidu", name: "百度" },
                          { id: "bing", name: "必应" },
                          { id: "google", name: "Google" },
                        ]}
                      />
                      <p className="muted-note">
                        输入关键词并按回车，在新标签页查看搜索结果。
                      </p>
                      <p className="shortcut-hint">
                        <kbd>/</kbd> 快速聚焦搜索框
                      </p>
                    </section>
                  </TabsContent>
                  <TabsContent value="sync">
                    <section className="settings-section">
                      <h3>数据同步</h3>
                      <SyncPanel
                        data={data}
                        setData={update}
                        ready={ready}
                        storageError={storageError}
                      />
                    </section>
                  </TabsContent>
                </Tabs>
              )}
              {panel === "quote" && (
                <div className="quote-detail">
                  <span>
                    {dateLabel} · {now ? lunar(now) : ""}
                  </span>
                  <Quote size={27} />
                  <p>{quote.text}</p>
                  <small>— {quote.author} —</small>
                  <div className="quote-actions">
                    <button className="secondary-button" onClick={copyQuote}>
                      <Copy size={16} />
                      复制
                    </button>
                    <button
                      className="primary-button"
                      onClick={() =>
                        update((d) => ({
                          ...d,
                          quoteIndex: (d.quoteIndex + 1) % quotes.length,
                        }))
                      }
                    >
                      <RotateCw size={16} />
                      换一句
                    </button>
                  </div>
                </div>
              )}
              {panel === "folder" && openFolderId &&
                (() => {
                  const folder = folderOf(openFolderId);
                  if (!folder) return null;
                  const members = data.bookmarks.filter(
                    (b) => b.folder === folder.id,
                  );
                  return (
                    <>
                      <div className="folder-manager">
                        <div className="folder-manager-header">
                          <input
                            className="folder-name-input"
                            value={folder.name}
                            maxLength={20}
                            aria-label="分组名"
                            onChange={(e) =>
                              renameFolder(folder.id, e.target.value)
                            }
                          />
                          <button
                            className="subtle-button"
                            onClick={() => removeFolder(folder.id)}
                            aria-label="删除分组"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {members.map((b, i) => renderBookmark(b, i, true))}
                        <div className="tile">
                          <button
                            className="folder-add"
                            onClick={() =>
                              openBookmark(null, folder.id)
                            }
                            aria-label={`向${folder.name}添加网址`}
                          >
                            <Plus size={27} />
                          </button>
                          <span className="tile-label">添加</span>
                        </div>
                      </div>
                      <p className="muted-note">
                        拖动网址可与同分组其他网址合并，按右键可调整顺序。
                      </p>
                    </>
                  );
                })()}
              {panel === "weather" && <WeatherDetail />}
              {panel === "transfer" && (
                <div className="info-panel">
                  <Send size={42} />
                  <h3>文件快传需要云端服务</h3>
                  <p>
                    当前版本保存个人网址、待办和笔记，暂未接入文件上传与跨设备传输。
                  </p>
                  <a
                    className="secondary-button"
                    href="https://www.haipc.cn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16} />
                    前往原站使用
                  </a>
                </div>
              )}
              {panel === "about" && (
                <div className="info-panel">
                  <img className="about-logo" src="/favicon.svg" alt="" />
                  <h3>HiTab · 我的起始页</h3>
                  <p>
                    参考 HiTab
                    的布局与视觉制作的独立复刻版，让每一次打开浏览器，都从喜欢的页面开始。
                  </p>
                  <div className="about-details">
                    <span>
                      <Monitor size={16} />
                      网址、待办、笔记与设置保存在当前浏览器
                    </span>
                    <span>
                      <ImageIcon size={16} />
                      天气和热搜为示例，点击可查看真实来源
                    </span>
                  </div>
                  <a
                    className="secondary-button"
                    href="https://www.haipc.cn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    访问参考网站
                    <ExternalLink size={16} />
                  </a>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Toaster position="bottom-center" theme={data.settings.theme} />
        <FolderMergeDialog
          open={mergeOpen}
          onOpenChange={(open) => {
            setMergeOpen(open);
            if (!open) setMergeDraft(null);
          }}
          draft={mergeDraft}
          onConfirm={confirmMerge}
        />
      </main>
    </SidebarProvider>
  );
}
