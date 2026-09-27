"use client";

import * as React from "react";

import {
  CornerDownLeftIcon,
  EllipsisIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react";
import {
  type PlateEditor,
  useEditorRef,
  useEditorSelector,
  usePluginOption,
} from "platejs/react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TanaZoomPlugin } from "@/components/editor/plugins/tana-zoom-plugin";
import { TanaCapturePlugin } from "@/components/editor/plugins/tana-capture-plugin";
import { TanaTimePlugin } from "@/components/editor/plugins/tana-time-plugin";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getTanaAncestorPaths,
  getTanaProjectionTarget,
  resolveTanaNodeTitle,
  type TanaIndex,
  getTanaNodePath,
  isTanaNodeElement,
  searchTanaNodes,
  normalizeTanaWorkspaceUi,
  type TanaWorkspaceUi,
  type TanaNode,
} from "@/lib/tana";

import { TanaIndexProvider, useTanaIndex } from "./tana-index-context";
import { TanaInspector } from "./tana-inspector";
import { TanaNodeViewHost } from "./tana-node-view-host";
import { TanaOutlinerOpenState } from "./tana-outliner-open-state";
import { TanaSidebar } from "./tana-sidebar";
import { TanaCaptureComposer } from "./tana-capture-composer";

export type PersistenceStatus =
  "browser-preview" | "error" | "saved" | "saving";

export function SearchResult({
  index,
  node,
  onNavigate,
}: {
  index: TanaIndex;
  node: TanaNode;
  onNavigate: (nodeId: string) => void;
}) {
  const target = getTanaProjectionTarget(index, node.id);
  if (!target) return null;
  const title = resolveTanaNodeTitle(index, target.id);

  return (
    <CommandItem
      className="group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--tana-hover)]"
      value={node.id}
      onSelect={() => onNavigate(node.id)}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded bg-[var(--tana-accent-soft)] text-[var(--tana-accent)] text-[10px]">
        {target.semanticType === "supertag-definition" ? "#" : "•"}
      </span>
      <span className="min-w-0 flex-1 truncate">{title || "未命名节点"}</span>
      <span className="opacity-0 text-[var(--tana-text-tertiary)] group-hover:opacity-100">
        <CornerDownLeftIcon className="size-3" />
      </span>
    </CommandItem>
  );
}

/** Selection uses current canonical data, then clears and dismisses the dialog. */
export function selectTanaSearchResult(
  editor: PlateEditor,
  nodeId: string,
  setQuery: (query: string) => void,
  setOpen: (open: boolean) => void,
) {
  const navigated = editor.getTransforms(TanaZoomPlugin).zoom.toResult(nodeId);
  setQuery("");
  setOpen(false);
  return navigated;
}

/** Dialog dismissal finishes before Plate restores focus to the newly zoomed Node. */
export function focusAfterTanaSearch(editor: PlateEditor) {
  const nodeId = editor.getOption(TanaZoomPlugin, "focusedNodeId");
  if (nodeId) return editor.getApi(TanaZoomPlugin).zoom.focus(nodeId);
  editor.tf.focus();
}

export function TanaWorkspace({
  documentRevision,
  persistenceStatus,
}: {
  documentRevision?: number;
  persistenceStatus: PersistenceStatus;
}) {
  return (
    <TanaIndexProvider revision={documentRevision}>
      <TanaWorkspaceContent persistenceStatus={persistenceStatus} />
    </TanaIndexProvider>
  );
}

function TanaWorkspaceContent({
  persistenceStatus,
}: {
  persistenceStatus: PersistenceStatus;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const [fieldPanelOpen, setFieldPanelOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [quickAddDraft, setQuickAddDraft] = React.useState("");
  const quickAddDraftRef = React.useRef("");
  const workspaceId = index.systemNodeIds.get("workspace");
  const workspacePath = workspaceId
    ? index.nodesById.get(workspaceId)?.path
    : undefined;
  const workspaceUi = normalizeTanaWorkspaceUi(
    workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
  );

  const updateWorkspaceUi = React.useCallback(
    (next: TanaWorkspaceUi) => {
      if (!workspacePath) return;
      editor.tf.setNodes({ tanaWorkspaceUi: next }, { at: workspacePath });
    },
    [editor, workspacePath],
  );

  const openQuickAdd = React.useCallback(() => {
    const restored =
      quickAddDraftRef.current || workspaceUi.quickAddDraft || "";
    setQuickAddDraft(restored);
    setQuickAddOpen(true);
  }, [workspaceUi.quickAddDraft]);

  const createNew = React.useCallback(() => {
    editor.getTransforms(TanaCapturePlugin).capture.commit("", { zoom: true });
  }, [editor]);

  const submitQuickAdd = React.useCallback(() => {
    const nodeId = editor
      .getTransforms(TanaCapturePlugin)
      .capture.commit(quickAddDraft, { zoom: false });
    if (!nodeId) return;
    quickAddDraftRef.current = "";
    updateWorkspaceUi({ ...workspaceUi, quickAddDraft: "" });
    setQuickAddOpen(false);
  }, [editor, quickAddDraft, updateWorkspaceUi, workspaceUi]);
  const focusedNodeId =
    usePluginOption(TanaZoomPlugin, "focusedNodeId") ?? null;
  const selectedNodeId = useEditorSelector((currentEditor) => {
    const selectedTopLevel = currentEditor.selection
      ? currentEditor.children[currentEditor.selection.anchor.path[0]]
      : undefined;
    const selectedTopLevelPath = currentEditor.selection
      ? [currentEditor.selection.anchor.path[0]]
      : undefined;

    return selectedTopLevel &&
      selectedTopLevelPath &&
      isTanaNodeElement(selectedTopLevel, selectedTopLevelPath) &&
      typeof selectedTopLevel.id === "string"
      ? selectedTopLevel.id
      : null;
  }, []);

  const focusedNodeExists = useEditorSelector(
    (currentEditor) =>
      !focusedNodeId || !!currentEditor.api.node({ at: [], id: focusedNodeId }),
    [focusedNodeId],
  );

  React.useEffect(() => {
    if (!focusedNodeExists) editor.getApi(TanaZoomPlugin).zoom.resetInvalid();
  }, [editor, focusedNodeExists]);

  const breadcrumbNodeIds = React.useMemo(() => {
    if (!focusedNodeId || !index.nodesById.has(focusedNodeId)) return [];

    const focusedPath = getTanaNodePath(editor.children, focusedNodeId);

    if (!focusedPath) return [];

    return [...getTanaAncestorPaths(editor.children, focusedPath), focusedPath]
      .map((path) => editor.api.node(path)?.[0])
      .flatMap((node) =>
        node && "id" in node && typeof node.id === "string" ? [node.id] : [],
      );
  }, [editor, focusedNodeId, index]);

  const breadcrumbs = breadcrumbNodeIds.flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node ? [node] : [];
  });
  const searchResults = searchTanaNodes(index, search);
  const activeNodeId = focusedNodeId ?? selectedNodeId;

  const navigateToSearchResult = (nodeId: string) => {
    selectTanaSearchResult(editor, nodeId, setSearch, setSearchOpen);
  };

  const openSearch = React.useCallback(() => {
    setSearch("");
    setSearchOpen(true);
  }, []);

  React.useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        openSearch();
      } else if (key === "e" && !event.shiftKey) {
        event.preventDefault();
        openQuickAdd();
      } else if (key === "d" && event.shiftKey) {
        event.preventDefault();
        editor.getTransforms(TanaTimePlugin).time.today();
      }
    };
    document.addEventListener("keydown", onGlobalKeyDown, true);
    return () => document.removeEventListener("keydown", onGlobalKeyDown, true);
  }, [editor, openQuickAdd, openSearch]);

  return (
    <div className="flex h-dvh min-w-0 bg-[var(--tana-sidebar)] text-[var(--tana-text)]">
      <TanaOutlinerOpenState />
      <TanaSidebar
        activeNodeId={activeNodeId}
        index={index}
        onCreateNew={createNew}
        onOpenSearch={openSearch}
        onQuickAdd={openQuickAdd}
        onUpdateUi={updateWorkspaceUi}
      />

      {workspaceUi.sidebar?.mode === "hidden" && (
        <button
          aria-label="恢复侧栏"
          className="absolute left-2 top-2 z-40 grid size-8 place-items-center rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] shadow"
          type="button"
          onClick={() =>
            updateWorkspaceUi({
              ...workspaceUi,
              sidebar: { ...workspaceUi.sidebar, mode: "full" },
            })
          }
        >
          恢复侧栏
        </button>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex h-10 shrink-0 items-center border-b border-[var(--tana-divider)] bg-[color:var(--tana-canvas)]/95 px-5">
          <nav
            aria-label="路径导航"
            className="flex min-w-0 flex-1 items-center gap-1 text-[var(--tana-text-tertiary)] text-xs"
          >
            <button
              className="truncate hover:text-[var(--tana-text)] disabled:text-[var(--tana-text)]"
              disabled={!focusedNodeId}
              type="button"
              onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.root()}
            >
              工作区
            </button>
            {breadcrumbs.map((node, breadcrumbIndex) => {
              const isCurrent = breadcrumbIndex === breadcrumbs.length - 1;

              return (
                <React.Fragment key={node.id}>
                  <span
                    aria-hidden="true"
                    className="text-[var(--tana-text-tertiary)]/60"
                  >
                    /
                  </span>
                  {isCurrent ? (
                    <span className="truncate font-medium text-[var(--tana-text)]">
                      {node.text || "未命名节点"}
                    </span>
                  ) : (
                    <button
                      className="truncate hover:text-[var(--tana-text)]"
                      type="button"
                      onClick={() =>
                        editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)
                      }
                    >
                      {node.text || "未命名节点"}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <div className="ml-4 flex shrink-0 items-center gap-2 text-xs">
            {persistenceStatus === "saving" && (
              <span
                aria-label="正在保存"
                className="size-1.5 animate-pulse rounded-full bg-[var(--tana-text-tertiary)]"
                title="正在保存"
              />
            )}
            {persistenceStatus === "error" && (
              <span className="font-medium text-destructive">保存失败</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="更多页面操作"
                  className="grid size-7 place-items-center rounded text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
                  type="button"
                >
                  <EllipsisIcon className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuLabel className="text-[11px] text-[var(--tana-text-tertiary)]">
                  当前页面
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setFieldPanelOpen(true)}>
                  <Settings2Icon />
                  配置…
                </DropdownMenuItem>
                {fieldPanelOpen && (
                  <DropdownMenuItem onSelect={() => setFieldPanelOpen(false)}>
                    关闭配置
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Dialog
            open={searchOpen}
            onOpenChange={(open) => {
              setSearchOpen(open);
              if (!open) setSearch("");
            }}
          >
            <DialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                focusAfterTanaSearch(editor);
              }}
            >
              <DialogTitle>全局搜索</DialogTitle>
              <DialogDescription>
                搜索标题、字段、标签和引用。
              </DialogDescription>
              <Command
                shouldFilter={false}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchOpen(false);
                    setSearch("");
                  }
                }}
              >
                <div className="mb-1 flex items-center gap-2 px-2 text-[var(--tana-text-tertiary)] text-[10px] uppercase tracking-[0.1em]">
                  <SearchIcon className="size-3" />
                  全局搜索
                </div>
                <CommandInput
                  autoFocus
                  aria-label="搜索所有节点"
                  className="h-9 text-sm"
                  placeholder="搜索所有节点"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList className="mt-2 max-h-80">
                  {search.trim() ? (
                    <>
                      <CommandEmpty>没有匹配的节点</CommandEmpty>
                      <CommandGroup heading="节点">
                        {searchResults.map((node) => (
                          <SearchResult
                            key={node.id}
                            index={index}
                            node={node}
                            onNavigate={navigateToSearchResult}
                          />
                        ))}
                      </CommandGroup>
                    </>
                  ) : (
                    <p className="px-2.5 py-5 text-center text-[var(--tana-text-tertiary)] text-xs">
                      输入关键词搜索所有节点
                    </p>
                  )}
                </CommandList>
                <div className="mt-1 flex items-center justify-between border-t border-[var(--tana-divider)] px-2 pt-2 text-[var(--tana-text-tertiary)] text-[10px]">
                  <span>↑↓ 选择 · Enter 打开</span>
                  <span>Esc 关闭</span>
                </div>
              </Command>
            </DialogContent>
          </Dialog>

          <Dialog
            open={quickAddOpen}
            onOpenChange={(open) => {
              setQuickAddOpen(open);
            }}
          >
            <DialogContent>
              <DialogTitle>Quick Add</DialogTitle>
              <DialogDescription>
                添加到 Today；Esc 保留草稿。
              </DialogDescription>
              <TanaCaptureComposer
                ariaLabel="Quick Add 草稿"
                value={quickAddDraft}
                onChange={(value) => {
                  setQuickAddDraft(value);
                  quickAddDraftRef.current = value;
                  updateWorkspaceUi({
                    ...workspaceUi,
                    quickAddDraft: value,
                  });
                }}
                onSubmit={submitQuickAdd}
                onCancel={() => setQuickAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1">
          <TanaNodeViewHost
            focusedNodeId={focusedNodeId}
            selectedNodeId={selectedNodeId}
          />
          {fieldPanelOpen && (
            <div
              className="absolute inset-y-0 right-0 z-30 max-w-full shadow-xl xl:relative xl:shrink-0 xl:shadow-none"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                  event.stopPropagation();
                  setFieldPanelOpen(false);
                }
              }}
            >
              <TanaInspector
                activeNodeId={activeNodeId}
                onClose={() => setFieldPanelOpen(false)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
