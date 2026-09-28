"use client";

import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  HashIcon,
  HomeIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";
import * as React from "react";
import { useEditorRef, usePluginOption } from "platejs/react";
import { TogglePlugin } from "@platejs/toggle/react";
import { TanaTimePlugin } from "@/components/editor/plugins/tana-time-plugin";
import { TanaZoomPlugin } from "@/components/editor/plugins/tana-zoom-plugin";
import { insertTanaChild } from "@/components/editor/plugins/tana-node-identity-plugin";
import { TanaWorkspacePlugin } from "@/components/editor/plugins/tana-workspace-plugin";
import {
  getActiveSupertagInstances,
  getTanaProjectionTarget,
  isTanaNodeActive,
  runTanaQuery,
  type NodeId,
  type TanaIndex,
  type TanaSidebarMode,
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

type TanaSidebarProps = {
  activeNodeId: NodeId | null;
  index: TanaIndex;
  onOpenSearch: () => void;
  onQuickAdd: () => void;
  onCreateNew: () => void;
  onUpdateUi: (ui: TanaWorkspaceUi) => void;
  onModeChange?: (mode: TanaSidebarMode) => void;
};

export function cycleTanaSidebarMode(mode: TanaSidebarMode): TanaSidebarMode {
  if (mode === "full") return "mini";
  if (mode === "mini") return "hidden";
  return "full";
}

const labels: Record<TanaSidebarTopItem, string> = {
  today: "Today",
  "create-new": "Create New",
  search: "Search",
  "quick-add": "Quick Add",
  supertags: "Supertags",
  recents: "Recents",
};

export function TanaSidebar({
  activeNodeId,
  index,
  onOpenSearch,
  onQuickAdd,
  onCreateNew,
  onUpdateUi,
  onModeChange,
}: TanaSidebarProps) {
  const editor = useEditorRef();
  const workspaceId = index.systemNodeIds.get("workspace");
  const workspaceUi = normalizeTanaWorkspaceUi(
    workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
  );
  const mode = workspaceUi.sidebar?.mode ?? "full";
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
  const updateUi = (patch: Parameters<typeof mergeTanaWorkspaceUi>[1]) =>
    onUpdateUi(mergeTanaWorkspaceUi(workspaceUi, patch));
  const setMode = (next: TanaSidebarMode) => {
    updateUi({ sidebar: { mode: next } });
    onModeChange?.(next);
  };
  const cycleMode = () => setMode(cycleTanaSidebarMode(mode));
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
    setResizeWidth(null);
    if (typeof next === "number") updateUi({ sidebar: { width: next } });
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
    if (mode !== "full") return;
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
    if (!resizing.current && event.buttons === 1 && mode === "full") {
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
  if (mode === "hidden") return null;
  if (mode === "mini")
    return (
      <aside
        aria-label="侧栏"
        className="flex h-full w-10 shrink-0 flex-col items-center border-r border-[var(--tana-divider)] bg-[var(--tana-sidebar)] pt-3"
        data-testid="tana-sidebar-mini"
      >
        <SidebarIconButton label="隐藏导航" onClick={cycleMode}>
          <Settings2Icon className="size-4" />
        </SidebarIconButton>
        <div className="mt-3 flex flex-col gap-1">
          <SidebarIconButton
            label="Today"
            onClick={() => editor.getTransforms(TanaTimePlugin).time.today()}
          >
            <CalendarDaysIcon className="size-4" />
          </SidebarIconButton>
          <SidebarIconButton label="Create New" onClick={onCreateNew}>
            <PlusIcon className="size-4" />
          </SidebarIconButton>
          <SidebarIconButton label="Search" onClick={onOpenSearch}>
            <SearchIcon className="size-4" />
          </SidebarIconButton>
          <SidebarIconButton label="Quick Add" onClick={onQuickAdd}>
            <SparklesIcon className="size-4" />
          </SidebarIconButton>
        </div>
      </aside>
    );
  const supertags = Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes("supertag-definition"),
  );
  const homeNodeId = index.systemNodeIds.get("home");
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
    const results = target.searchDefinition
      ? runTanaQuery(index, target.searchDefinition.query, {
          excludeNodeId: target.id,
          limit: 12,
        })
      : (index.childrenByParent.get(target.id) ?? []).flatMap((childId) => {
          const child = index.nodesById.get(childId);
          return child && isTanaNodeActive(index, child.id) ? [child] : [];
        });
    return [{ target, results }];
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
          onClick={() => editor.getTransforms(TanaTimePlugin).time.today()}
        >
          <CalendarDaysIcon className="size-3.5 text-[var(--tana-accent)]" />
          Today
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
          Create New
        </SidebarButton>
      );
    if (item === "search")
      return (
        <SidebarButton
          key={item}
          data-testid="sidebar-search"
          onClick={onOpenSearch}
        >
          <SearchIcon className="size-3.5 text-[var(--tana-accent)]" />
          Search
          <span className="ml-auto text-[var(--tana-text-tertiary)] text-[10px]">
            ⌘ S
          </span>
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
          Quick Add
          <span className="ml-auto text-[var(--tana-text-tertiary)] text-[10px]">
            ⌘ E
          </span>
        </SidebarButton>
      );
    if (item === "supertags")
      return (
        <SidebarSection key={item} title="Supertags">
          {supertags.map((node) => (
            <SidebarButton
              key={node.id}
              active={activeNodeId === node.id}
              onClick={() =>
                editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)
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
      <section className="mt-5" key={item}>
        <button
          aria-expanded={recentsOpen}
          className="flex w-full items-center justify-between px-2 py-1.5 text-left font-medium text-[11px] text-[var(--tana-text-tertiary)]"
          type="button"
          onClick={() => setRecentsOpen((open) => !open)}
        >
          Recents <span>{recentsOpen ? "−" : "+"}</span>
        </button>
        {recentsOpen &&
          recents.map((node) => (
            <SidebarButton
              key={node.id}
              onClick={() =>
                editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)
              }
            >
              <span className="size-1.5 rounded-full bg-[var(--tana-text-tertiary)]" />
              <span className="truncate">{node.text || "未命名节点"}</span>
            </SidebarButton>
          ))}
      </section>
    );
  };
  const renderWorkspaceTree = (parentId: NodeId, depth = 0): React.ReactNode => {
    const childIds = index.childrenByParent.get(parentId) ?? [];
    return childIds.flatMap((childId) => {
      const child = index.nodesById.get(childId);
      if (!child || !isTanaNodeActive(index, child.id)) return [];
      const descendants = index.childrenByParent.get(child.id) ?? [];
      const expanded = openIds.has(child.id);
      return [
        <div key={child.id}>
          <div className="flex items-center gap-0.5">
            {descendants.length > 0 ? (
              <button
                aria-label={`${expanded ? "收起" : "展开"} ${child.text || "未命名节点"}`}
                className="grid size-5 shrink-0 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
                type="button"
                onClick={() =>
                  editor
                    .getApi(TogglePlugin)
                    .toggle.toggleIds([child.id], !expanded)
                }
              >
                {expanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" />
            )}
            <SidebarButton
              className="min-w-0 flex-1"
              active={activeNodeId === child.id}
              onClick={() =>
                editor.getTransforms(TanaZoomPlugin).zoom.to(child.id)
              }
            >
              <span className="truncate">
                {child.text || "未命名节点"}
              </span>
            </SidebarButton>
          </div>
          {expanded && (
            <div className="ml-3" style={{ paddingLeft: depth * 4 }}>
              {renderWorkspaceTree(child.id, depth + 1)}
            </div>
          )}
        </div>,
      ];
    });
  };
  const reorderTopItem = (item: TanaSidebarTopItem, direction: -1 | 1) => {
    const itemIndex = orderedItems.indexOf(item);
    const nextIndex = itemIndex + direction;
    if (itemIndex < 0 || nextIndex < 0 || nextIndex >= orderedItems.length) return;
    const next = [...orderedItems];
    [next[itemIndex], next[nextIndex]] = [next[nextIndex]!, next[itemIndex]!];
    updateUi({ sidebar: { topItems: next } });
  };
  const hideTopItem = (item: TanaSidebarTopItem) =>
    updateUi({ sidebar: { topItems: orderedItems.filter((candidate) => candidate !== item) } });
  const renderTopItemMenu = (item: TanaSidebarTopItem) => (
    <ContextMenu key={item}>
      <ContextMenuTrigger asChild>
        <div data-testid={`sidebar-top-item-${item}`}>{renderTopItem(item)}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => hideTopItem(item)}>隐藏</ContextMenuItem>
        <ContextMenuItem
          disabled={orderedItems.indexOf(item) === 0}
          onSelect={() => reorderTopItem(item, -1)}
        >
          上移
        </ContextMenuItem>
        <ContextMenuItem
          disabled={orderedItems.indexOf(item) === orderedItems.length - 1}
          onSelect={() => reorderTopItem(item, 1)}
        >
          下移
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
  return (
    <aside
      aria-label="侧栏"
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--tana-divider)] bg-[var(--tana-sidebar)]"
      data-testid="tana-sidebar"
      ref={sidebarRef}
      style={{ width: resizeWidth ?? width }}
    >
      <div className="flex h-12 items-center justify-between px-4">
        <span className="flex items-center gap-2 font-medium text-[13px]">
          <span className="grid size-5 place-items-center rounded-md bg-[var(--tana-accent)] font-semibold text-white text-[10px]">
            T
          </span>
          Local Tana
        </span>
        <div className="flex items-center gap-1">
          <button
            aria-label="侧栏设置"
            className="grid size-7 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings2Icon className="size-3.5" />
          </button>
          <button
            aria-label="收起导航"
            className="grid size-7 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={cycleMode}
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        </div>
      </div>
      {settingsOpen && (
        <div
          className="absolute right-2 top-11 z-50 w-56 rounded-md border border-[var(--tana-divider)] bg-[var(--tana-canvas)] p-2 text-xs shadow-xl"
          data-testid="sidebar-settings"
        >
          <p className="px-2 py-1 font-medium">侧栏显示</p>
          <div className="grid grid-cols-3 gap-1 p-1">
            {(["full", "mini", "hidden"] as const).map((next) => (
              <button
                key={next}
                className={cn(
                  "rounded px-2 py-1",
                  mode === next &&
                    "bg-[var(--tana-selected)] text-[var(--tana-accent)]",
                )}
                type="button"
                onClick={() => {
                  setMode(next);
                  setSettingsOpen(false);
                }}
              >
                {next === "full" ? "完整" : next === "mini" ? "迷你" : "隐藏"}
              </button>
            ))}
          </div>
          <button
            className="mt-1 w-full rounded px-2 py-1 text-left hover:bg-[var(--tana-hover)]"
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
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
        <nav aria-label="主导航" className="space-y-0.5">
          {visible
            .filter((item) => item !== "supertags" && item !== "recents")
            .map(renderTopItemMenu)}
        </nav>
        {visible
          .filter((item) => item === "supertags" || item === "recents")
          .map(renderTopItemMenu)}
        <SidebarSection title="Pinned">
          <div className="space-y-0.5">
            {pinned.map(({ target, results }) => (
              <div key={target.id}>
                <div className="flex items-center">
                  <SidebarButton
                    active={activeNodeId === target.id}
                    onClick={() =>
                      editor.getTransforms(TanaZoomPlugin).zoom.to(target.id)
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
                    {openIds.has(target.id) ? "收起" : "展开"} ({results.length}
                    )
                  </button>
                )}
                {openIds.has(target.id) &&
                  target.searchDefinition &&
                  results.map((result) => (
                    <SidebarButton
                      className="pl-6"
                      key={`${target.id}:${result.id}`}
                      onClick={() =>
                        editor.getTransforms(TanaZoomPlugin).zoom.to(result.id)
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
                        editor.getTransforms(TanaZoomPlugin).zoom.to(result.id)
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
        </SidebarSection>
        <SidebarSection title="Workspace">
          <div className="flex items-center gap-0.5">
            {homeNodeId && (index.childrenByParent.get(homeNodeId)?.length ?? 0) > 0 ? (
              <button
                aria-label={`${openIds.has(homeNodeId) ? "收起" : "展开"} Home`}
                className="grid size-5 shrink-0 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
                type="button"
                onClick={() =>
                  editor
                    .getApi(TogglePlugin)
                    .toggle.toggleIds([homeNodeId], !openIds.has(homeNodeId))
                }
              >
                {openIds.has(homeNodeId) ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" />
            )}
            <SidebarButton
              className="min-w-0 flex-1"
              active={activeNodeId === homeNodeId}
              onClick={(event) => {
                if (event.altKey) {
                  editor.getTransforms(TanaTimePlugin).time.today();
                } else if (homeNodeId) {
                  editor.getTransforms(TanaZoomPlugin).zoom.to(homeNodeId);
                } else {
                  editor.getTransforms(TanaZoomPlugin).zoom.root();
                }
              }}
            >
              <HomeIcon className="size-3.5" />
              Home
            </SidebarButton>
          </div>
          {homeNodeId && openIds.has(homeNodeId) && (
            <div className="mt-0.5">{renderWorkspaceTree(homeNodeId)}</div>
          )}
          <button
            aria-label="新建 Home 子节点"
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1 text-[10px] text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() => {
              if (homeNodeId) insertTanaChild(editor, homeNodeId);
            }}
          >
            <PlusIcon className="size-3" />
            新建子节点
          </button>
        </SidebarSection>
      </div>
      <div
        aria-label="调整侧栏宽度"
        className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
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
    <section className="mt-5">
      <h2 className="px-2 py-1.5 font-medium text-[11px] text-[var(--tana-text-tertiary)]">
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
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]",
        active &&
          "bg-[var(--tana-selected)] font-medium text-[var(--tana-accent)]",
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
function SidebarIconButton({
  label,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
