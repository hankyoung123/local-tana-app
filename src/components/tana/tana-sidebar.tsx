"use client";

import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HashIcon,
  HomeIcon,
  Layers3Icon,
  PinIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  SearchIcon,
  SunMoonIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { useEditorRef, usePluginOption } from "platejs/react";
import { TogglePlugin } from "@platejs/toggle/react";
import { TanaTimePlugin } from "@/components/editor/plugins/tana-time-plugin";
import { TanaZoomPlugin } from "@/components/editor/plugins/tana-zoom-plugin";
import { TanaWorkspacePlugin } from "@/components/editor/plugins/tana-workspace-plugin";
import {
  getActiveSupertagInstances,
  evaluateTanaQuery,
  getTanaProjectionTarget,
  isTanaNodeActive,
  type NodeId,
  type TanaIndex,
  type TanaSidebarTopItem,
  type TanaWorkspaceUi,
} from "@/lib/tana";
import {
  clampTanaSidebarWidth,
  DEFAULT_TANA_SIDEBAR_TOP_ITEMS,
  mergeTanaWorkspaceUi,
  normalizeTanaSidebarTopItems,
  normalizeTanaWorkspaceUi,
  TANA_SIDEBAR_DEFAULT_WIDTH,
  TANA_SIDEBAR_TOP_ITEMS,
} from "@/lib/tana/workspace-ui";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { StillAppearance } from './use-still-appearance';

type TanaSidebarProps = {
  activeNodeId: NodeId | null;
  index: TanaIndex;
  onQuickAdd: () => void;
  onCreateNew: () => void;
  onUpdateUi: (ui: TanaWorkspaceUi) => void;
  onSearch: () => void;
  onNavigate: () => void;
  appearance: StillAppearance;
  onAppearanceChange: (appearance: StillAppearance) => void;
};

const labels: Record<TanaSidebarTopItem, string> = {
  today: "今日笔记",
  "create-new": "新建节点",
  "quick-add": "快速记录",
  supertags: "类型",
  recents: "最近",
};

export function TanaSidebar({
  activeNodeId,
  index,
  onQuickAdd,
  onCreateNew,
  onUpdateUi,
  onSearch,
  onNavigate,
  appearance,
  onAppearanceChange,
}: TanaSidebarProps) {
  const editor = useEditorRef();
  const workspaceId = index.systemNodeIds.get("workspace");
  const workspaceUi = normalizeTanaWorkspaceUi(
    workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
  );
  const sidebarHidden = workspaceUi.sidebar?.mode === "hidden";
  const sidebarMode = workspaceUi.sidebar?.mode ?? "full";
  const width = workspaceUi.sidebar?.width ?? TANA_SIDEBAR_DEFAULT_WIDTH;
  const orderedItems = normalizeTanaSidebarTopItems(
    workspaceUi.sidebar?.topItems,
  );
  const hiddenItems = TANA_SIDEBAR_TOP_ITEMS.filter(
    (item) => !orderedItems.includes(item),
  );
  const pinnedIds = workspaceUi.sidebar?.pinnedNodeIds ?? [];
  const openIds = usePluginOption(TogglePlugin, "openIds") ?? new Set<string>();
  const [resizeWidth, setResizeWidth] = React.useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [recentsOpen, setRecentsOpen] = React.useState(false);
  const resizing = React.useRef(false);
  const resizeWidthRef = React.useRef<number | null>(null);
  const resizePointerId = React.useRef<number | null>(null);
  const resizeListeners = React.useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    cancel: () => void;
  } | null>(null);
  const sidebarRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!resizing.current && resizeWidth !== null && width === resizeWidth) {
      setResizeWidth(null);
    }
  }, [resizeWidth, width]);
  const updateUi = (patch: Parameters<typeof mergeTanaWorkspaceUi>[1]) =>
    onUpdateUi(mergeTanaWorkspaceUi(workspaceUi, patch));
  const navigate = (nodeId?: NodeId) => {
    onNavigate();
    if (nodeId) editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
    else editor.getTransforms(TanaZoomPlugin).zoom.root();
  };
  const navigateToday = () => {
    onNavigate();
    editor.getTransforms(TanaTimePlugin).time.today();
  };
  const resizeFromPointer = (clientX: number) => {
    const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
    const next = clampTanaSidebarWidth(clientX - left);
    resizeWidthRef.current = next;
    setResizeWidth(next);
  };
  const commitResize = (override?: number) => {
    if (!resizing.current) return;
    resizing.current = false;
    const next = override ?? resizeWidthRef.current;
    resizeWidthRef.current = null;
    if (typeof next === "number") {
      setResizeWidth(next);
      updateUi({ sidebar: { width: next } });
    } else {
      setResizeWidth(null);
    }
  };
  const cancelResize = () => {
    if (!resizing.current) return;
    resizing.current = false;
    resizeWidthRef.current = null;
    resizePointerId.current = null;
    setResizeWidth(null);
  };
  const detachResizeListeners = () => {
    const listeners = resizeListeners.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.up);
    window.removeEventListener("pointercancel", listeners.cancel);
    resizeListeners.current = null;
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizing.current = true;
    resizePointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Native window listeners below keep the drag alive when capture is unavailable.
    }
    resizeFromPointer(event.clientX);
    const move = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId === resizePointerId.current) {
        resizeFromPointer(nativeEvent.clientX);
      }
    };
    const up = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== resizePointerId.current) return;
      resizeFromPointer(nativeEvent.clientX);
      detachResizeListeners();
      commitResize(resizeWidthRef.current ?? undefined);
    };
    const cancel = () => {
      detachResizeListeners();
      cancelResize();
    };
    resizeListeners.current = { move, up, cancel };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing.current && event.buttons === 1) {
      resizing.current = true;
      resizePointerId.current = event.pointerId;
    }
    if (resizing.current) resizeFromPointer(event.clientX);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeFromPointer(event.clientX);
    detachResizeListeners();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitResize(resizeWidthRef.current ?? undefined);
  };
  if (sidebarHidden) return null;
  const supertags = Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes("supertag-definition"),
  );
  const homeNodeId = index.systemNodeIds.get("home");
  const workspaceNodeId = index.systemNodeIds.get("workspace");
  const trashNodeId = index.systemNodeIds.get("trash");
  const recents = Array.from(index.nodesById.values())
    .filter(
      (node) =>
        isTanaNodeActive(index, node.id) &&
        !node.semanticTypes.includes("field") &&
        !node.semanticTypes.includes("value") &&
        (node.supertagIds.length > 0 ||
          index.parentNodeIds.get(node.id) ===
            index.systemNodeIds.get("library")),
    )
    .sort((a, b) =>
      (b.lastEditedAt ?? b.createdAt ?? "").localeCompare(
        a.lastEditedAt ?? a.createdAt ?? "",
      ),
    )
    .slice(0, 100);
  const pinned = pinnedIds.flatMap((id) => {
    const target = getTanaProjectionTarget(index, id);
    if (!target) return [];
    const evaluation = target.searchDefinition
      ? evaluateTanaQuery(index, target.searchDefinition.query, {
          excludeNodeId: target.id,
          limit: 12,
          searchHostId: target.id,
        })
      : { nodes: (index.childrenByParent.get(target.id) ?? []).flatMap((childId) => {
          const child = index.nodesById.get(childId);
          return child && isTanaNodeActive(index, child.id) ? [child] : [];
        }), status: 'ok' as const };
    return [{ target, results: evaluation.nodes, status: evaluation.status }];
  });
  const visible = orderedItems
    .filter((item) => item !== "supertags" || supertags.length > 0)
    .filter((item) => item !== "recents" || recents.length > 0);
  const renderTopItem = (item: TanaSidebarTopItem) => {
    if (item === "today")
      return (
        <SidebarButton
          key={item}
          data-testid="sidebar-today"
          onClick={navigateToday}
        >
          <CalendarDaysIcon className="size-3.5 text-[var(--tana-accent)]" />
          今日笔记
        </SidebarButton>
      );
    if (item === "create-new")
      return (
        <SidebarButton
          key={item}
          data-testid="sidebar-create-new"
          onClick={onCreateNew}
        >
          <PlusIcon className="size-3.5 text-[var(--tana-accent)]" />
          新建节点
        </SidebarButton>
      );
    if (item === "quick-add")
      return (
        <SidebarButton
          key={item}
          data-testid="sidebar-quick-add"
          onClick={onQuickAdd}
        >
          <SparklesIcon className="size-3.5 text-[var(--tana-accent)]" />
          快速记录
          <span className="ml-auto text-[var(--tana-text-tertiary)] text-[10px]">
            ⌘ E
          </span>
        </SidebarButton>
      );
    if (item === "supertags")
      return (
        <SidebarSection key={item} title="类型">
          {supertags.map((node) => (
            <SidebarButton
              key={node.id}
              active={activeNodeId === node.id}
              onClick={() =>
                navigate(node.id)
              }
            >
              <HashIcon className="size-3.5 text-[var(--tana-accent)]" />
              <span className="truncate">#{node.text || "未命名超级标签"}</span>
              <span className="ml-auto text-[10px] tabular-nums">
                {getActiveSupertagInstances(index, node.id).length}
              </span>
            </SidebarButton>
          ))}
        </SidebarSection>
      );
    return (
      <section className="tana-sidebar-section" key={item}>
        <button
          aria-expanded={recentsOpen}
          className="tana-sidebar-section-title"
          type="button"
          onClick={() => setRecentsOpen((open) => !open)}
        >
          最近 <ChevronDownIcon className={cn("size-3 transition-transform", !recentsOpen && "-rotate-90")} />
        </button>
        {recentsOpen &&
          recents.map((node) => (
            <SidebarButton
              key={node.id}
              onClick={() =>
                navigate(node.id)
              }
            >
              <span className="size-1.5 rounded-full bg-[var(--tana-text-tertiary)]" />
              <span className="truncate">{node.text || "未命名节点"}</span>
            </SidebarButton>
          ))}
      </section>
    );
  };
  return (
    <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
    <aside
      id="tana-sidebar"
      aria-label="侧栏"
      className="tana-sidebar relative flex h-full shrink-0 flex-col"
      data-sidebar-mode={sidebarMode}
      data-testid="tana-sidebar"
      ref={sidebarRef}
      style={{ width: resizeWidth ?? width }}
    >
      <div className="tana-sidebar-header flex shrink-0 items-center justify-between" data-tauri-drag-region>
        <button aria-label="返回个人知识库" className="flex items-center gap-2.5 font-semibold text-[13px]" type="button" onClick={() => navigate()}>
          <span aria-hidden="true" className="tana-brand-mark grid size-6 place-items-center text-[16px]">∴</span>
          still
        </button>
      </div>
      <button aria-label="打开全局搜索" className="tana-sidebar-search shrink-0" type="button" onClick={onSearch}>
        <SearchIcon className="size-3.5" /><span className="flex-1 text-left">搜索知识库</span><kbd className="tana-keycap">⌘ K</kbd>
      </button>
        <PopoverContent
          align="start"
          side="top"
          className="w-56 p-2 text-xs"
          data-testid="sidebar-settings"
        >
          <button
            className="w-full rounded px-2 py-1 text-left hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() =>
              updateUi({
                sidebar: {
                  width: TANA_SIDEBAR_DEFAULT_WIDTH,
                  topItems: DEFAULT_TANA_SIDEBAR_TOP_ITEMS,
                },
              })
            }
          >
            恢复默认宽度与项目
          </button>
          <div className="mt-2 border-t border-[var(--tana-divider)] pt-2">
            <p className="px-2 py-1 text-[10px] text-[var(--tana-text-tertiary)]">
              顶部项目
            </p>
            {orderedItems.map((item, index) => (
              <ContextMenu key={item}>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 px-1 py-0.5">
                    <span className="min-w-0 flex-1 truncate">
                      {labels[item]}
                    </span>
                    <button
                      aria-label={`隐藏 ${labels[item]}`}
                      className="rounded px-1 text-[10px] hover:bg-[var(--tana-hover)]"
                      type="button"
                      onClick={() =>
                        updateUi({
                          sidebar: {
                            topItems: orderedItems.filter(
                              (candidate) => candidate !== item,
                            ),
                          },
                        })
                      }
                    >
                      隐藏
                    </button>
                    <button
                      aria-label={`上移 ${labels[item]}`}
                      disabled={index === 0}
                      className="rounded p-1 hover:bg-[var(--tana-hover)] disabled:opacity-30"
                      type="button"
                      onClick={() => {
                        const next = [...orderedItems];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        updateUi({ sidebar: { topItems: next } });
                      }}
                    >
                      <ChevronUpIcon className="size-3" />
                    </button>
                    <button
                      aria-label={`下移 ${labels[item]}`}
                      disabled={index === orderedItems.length - 1}
                      className="rounded p-1 hover:bg-[var(--tana-hover)] disabled:opacity-30"
                      type="button"
                      onClick={() => {
                        const next = [...orderedItems];
                        [next[index], next[index + 1]] = [
                          next[index + 1]!,
                          next[index]!,
                        ];
                        updateUi({ sidebar: { topItems: next } });
                      }}
                    >
                      <ChevronDownIcon className="size-3" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() =>
                      updateUi({
                        sidebar: {
                          topItems: orderedItems.filter(
                            (candidate) => candidate !== item,
                          ),
                        },
                      })
                    }
                  >
                    隐藏
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={index === 0}
                    onSelect={() => {
                      const next = [...orderedItems];
                      [next[index - 1], next[index]] = [
                        next[index]!,
                        next[index - 1]!,
                      ];
                      updateUi({ sidebar: { topItems: next } });
                    }}
                  >
                    上移
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={index === orderedItems.length - 1}
                    onSelect={() => {
                      const next = [...orderedItems];
                      [next[index], next[index + 1]] = [
                        next[index + 1]!,
                        next[index]!,
                      ];
                      updateUi({ sidebar: { topItems: next } });
                    }}
                  >
                    下移
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {hiddenItems.length > 0 && (
              <div className="mt-2 border-t border-[var(--tana-divider)] pt-1">
                <p className="px-2 py-1 text-[10px] text-[var(--tana-text-tertiary)]">
                  已隐藏
                </p>
                {hiddenItems.map((item) => (
                  <button
                    aria-label={`显示 ${labels[item]}`}
                    className="block w-full rounded px-2 py-1 text-left hover:bg-[var(--tana-hover)]"
                    key={item}
                    type="button"
                    onClick={() =>
                      updateUi({
                        sidebar: { topItems: [...orderedItems, item] },
                      })
                    }
                  >
                    显示 {labels[item]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      <div className="tana-sidebar-scroll min-h-0 flex-1 overflow-y-auto pb-5">
        <nav aria-label="主导航" className="space-y-0.5">
          {visible
            .filter((item) => item !== "supertags" && item !== "recents")
            .map(renderTopItem)}
          <SidebarButton active={!activeNodeId || activeNodeId === workspaceNodeId} onClick={() => navigate()}><Layers3Icon className="size-3.5" />全部节点</SidebarButton>
          <SidebarButton active={activeNodeId === homeNodeId} onClick={() => navigate(homeNodeId)}><HomeIcon className="size-3.5" />主页</SidebarButton>
        </nav>
        {visible
          .filter((item) => item === "supertags" || item === "recents")
          .map(renderTopItem)}
        {pinned.length > 0 && <SidebarSection title="固定">
          <div className="space-y-0.5">
            {pinned.map(({ target, results, status }) => (
              <div key={target.id}>
                <div className="flex items-center">
                  <SidebarButton
                    active={activeNodeId === target.id}
                    onClick={() =>
                      navigate(target.id)
                    }
                  >
                    <PinIcon className="size-3.5 text-[var(--tana-accent)]" />
                    <span className="truncate">
                      {target.text || "未命名节点"}
                    </span>
                  </SidebarButton>
                  <button
                    aria-label={"取消固定 " + (target.text || "节点")}
                    className="grid size-6 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
                    type="button"
                    onClick={() =>
                      editor
                        .getTransforms(TanaWorkspacePlugin)
                        .workspace.setPinned(target.id, false)
                    }
                  >
                    ×
                  </button>
                </div>
                {(target.searchDefinition || results.length > 0) && (
                  <button
                    className="ml-5 flex items-center gap-1 text-[10px] text-[var(--tana-text-tertiary)]"
                    type="button"
                    onClick={() =>
                      editor
                        .getApi(TogglePlugin)
                        .toggle.toggleIds([target.id], !openIds.has(target.id))
                    }
                  >
                    {openIds.has(target.id) ? "收起" : "展开"} ({status === 'too-many-results' ? '2500+' : results.length})
                  </button>
                )}
                {openIds.has(target.id) && status === 'too-many-results' && (
                  <p className="ml-5 py-1 text-[10px] text-[var(--tana-text-tertiary)]" role="status">
                    结果超过 2500 条，请缩小查询范围
                  </p>
                )}
                {openIds.has(target.id) && status === 'broken' && (
                  <p className="ml-5 py-1 text-[10px] text-[var(--tana-text-tertiary)]" role="status">
                    搜索条件已失效，请修复查询
                  </p>
                )}
                {openIds.has(target.id) &&
                  target.searchDefinition && status === 'ok' &&
                  results.map((result) => (
                    <SidebarButton
                      className="pl-6"
                      key={`${target.id}:${result.id}`}
                      onClick={() =>
                        navigate(result.id)
                      }
                    >
                      <span className="truncate">
                        {result.text || "未命名节点"}
                      </span>
                    </SidebarButton>
                  ))}
                {openIds.has(target.id) &&
                  !target.searchDefinition &&
                  results.map((result) => (
                    <SidebarButton
                      className="pl-6"
                      key={target.id + ":" + result.id}
                      onClick={() =>
                        navigate(result.id)
                      }
                    >
                      <span className="truncate">
                        {result.text || "未命名节点"}
                      </span>
                    </SidebarButton>
                  ))}
              </div>
            ))}
          </div>
        </SidebarSection>}
        <SidebarSection title="空间">
          {trashNodeId && <SidebarButton active={activeNodeId === trashNodeId} onClick={() => navigate(trashNodeId)}><Trash2Icon className="size-3.5" />回收站</SidebarButton>}
        </SidebarSection>
      </div>
      <div className="tana-sidebar-footer">
        <span className="tana-sidebar-footer-label">个人空间</span>
        <PopoverTrigger asChild><button aria-label="侧栏设置" className="tana-shell-control" type="button"><Settings2Icon className="size-3.5" /></button></PopoverTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button aria-label="切换明暗主题" className="tana-shell-control" type="button"><SunMoonIcon className="size-3.5" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {(['system', 'light', 'dark'] as const).map((value) => (
              <DropdownMenuItem key={value} onSelect={() => onAppearanceChange(value)}>
                {value === 'system' ? '跟随系统' : value === 'light' ? '浅色' : '深色'}
                {appearance === value && <span className="ml-auto text-xs text-[var(--still-muted)]">当前</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        aria-label="调整侧栏宽度"
        className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none"
        data-testid="sidebar-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          detachResizeListeners();
          cancelResize();
        }}
      />
    </aside>
    </Popover>
  );
}
function SidebarSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="tana-sidebar-section">
      <h2 className="tana-sidebar-section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
function SidebarButton({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        "tana-sidebar-item flex w-full items-center rounded-lg text-left",
        active &&
          "tana-sidebar-item-active",
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
