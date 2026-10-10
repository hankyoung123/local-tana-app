"use client";

import * as React from "react";

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { CornerDownLeftIcon, SearchIcon } from "lucide-react";
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
import {
  getTanaEditorHref,
  getTanaEditorNodeId,
  TANA_EDITOR_PATH,
  TanaZoomPlugin,
} from "@/components/editor/plugins/tana-zoom-plugin";
import { TanaCapturePlugin } from "@/components/editor/plugins/tana-capture-plugin";
import { TanaNodeIdentityPlugin } from '@/components/editor/plugins/tana-node-identity-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaShortcutsPlugin } from '@/components/editor/plugins/tana-shortcuts-plugin';
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
  getTanaAncestorPaths,
  getTanaProjectionTarget,
  resolveTanaNodeTitle,
  type TanaIndex,
  getTanaNodePath,
  isTanaNodeElement,
  searchTanaNodes,
  normalizeTanaWorkspaceUi,
  captureDraftHasText,
  normalizeTanaCaptureDraft,
  type TanaCaptureDraft,
  type TanaSidebarMode,
  type TanaWorkspaceUi,
  type TanaNode,
} from "@/lib/tana";

import { TanaIndexProvider, useTanaIndex } from "./tana-index-context";
import { TanaInspector } from "./tana-inspector";
import { TanaNodeViewHost } from "./tana-node-view-host";
import { TanaOutlinerOpenState } from "./tana-outliner-open-state";
import { TanaSidebar } from "./tana-sidebar";
import { TanaCaptureComposer } from "./tana-capture-composer";
import { TanaCommandPalette } from './tana-command-palette';
import { TanaPanelResizer } from './tana-panel-resizer';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  isTanaWorkspaceCommandId,
  runTanaWorkspaceCommand,
  type TanaWorkspaceCommandHandlers,
  type TanaWorkspaceCommandId,
} from './tana-workspace-commands';
import { TanaWorkspaceToolbar } from './tana-workspace-toolbar';
import { TanaWorkspaceShell } from './tana-workspace-shell';
import { TanaInspectorContext } from './tana-inspector-context';
import { useStillAppearance } from './use-still-appearance';
import type { PersistenceStatus } from './tana-workspace-types';

export type { PersistenceStatus } from './tana-workspace-types';

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
  const [inspectedNodeId, setInspectedNodeId] = React.useState<string | null>(null);
  const [focusMode, setFocusMode] = React.useState(false);
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const narrowWindow = useIsMobile(801);
  const { appearance, changeAppearance } = useStillAppearance();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [quickAddSession, setQuickAddSession] = React.useState(0);
  const [inspectorWidth, setInspectorWidth] = React.useState(320);
  const [quickAddDraft, setQuickAddDraft] = React.useState<TanaCaptureDraft>(() =>
    normalizeTanaCaptureDraft(""),
  );
  const quickAddDraftRef = React.useRef<TanaCaptureDraft>(normalizeTanaCaptureDraft(""));
  const workspaceId = index.systemNodeIds.get("workspace");
  const workspacePath = workspaceId
    ? index.nodesById.get(workspaceId)?.path
    : undefined;
  const workspaceUi = normalizeTanaWorkspaceUi(
    workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
  );
  const sidebarMode: TanaSidebarMode = workspaceUi.sidebar?.mode ?? 'full';
  const navigationExpanded = !focusMode && sidebarMode !== 'hidden' &&
    (!narrowWindow || navigationOpen);

  const updateWorkspaceUi = React.useCallback(
    (next: TanaWorkspaceUi) => {
      if (!workspacePath) return;
      editor.tf.setNodes({ tanaWorkspaceUi: next }, { at: workspacePath });
    },
    [editor, workspacePath],
  );

  const openQuickAdd = React.useCallback(() => {
    const persisted = normalizeTanaCaptureDraft(workspaceUi.quickAddDraft);
    const restored = captureDraftHasText(persisted)
      ? persisted
      : captureDraftHasText(quickAddDraftRef.current)
      ? quickAddDraftRef.current
      : persisted;
    setQuickAddDraft(restored);
    quickAddDraftRef.current = restored;
    setQuickAddSession((session) => session + 1);
    setQuickAddOpen(true);
  }, [workspaceUi.quickAddDraft]);

  const createNew = React.useCallback(() => {
    editor.getTransforms(TanaCapturePlugin).capture.commit("", { zoom: true });
  }, [editor]);

  const submitQuickAdd = React.useCallback(() => {
    if (!captureDraftHasText(quickAddDraft)) return;
    const nodeId = editor.getTransforms(TanaCapturePlugin).capture.commit(quickAddDraft, { zoom: false });
    if (!nodeId) return;
    const blank = normalizeTanaCaptureDraft("");
    quickAddDraftRef.current = blank;
    updateWorkspaceUi({ ...workspaceUi, quickAddDraft: blank });
    setQuickAddDraft(blank);
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

  const navigationHydrated = React.useRef(false);

  React.useEffect(() => {
    if (navigationHydrated.current || !index.nodesById.size) return;

    navigationHydrated.current = true;
    const nodeId = getTanaEditorNodeId(window.location);
    if (nodeId) {
      editor.getApi(TanaZoomPlugin).zoom.restore(nodeId);
    } else {
      window.history.replaceState(
        {
          ...(window.history.state && typeof window.history.state === "object"
            ? window.history.state
            : {}),
          tanaNodeId: null,
          tanaHistory: [null],
          tanaHistoryIndex: 0,
        },
        '',
        getTanaEditorHref(),
      );
    }
  }, [editor, index.nodesById.size]);

  React.useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (window.location.pathname !== TANA_EDITOR_PATH) return;

      const nodeId = getTanaEditorNodeId(window.location);
      editor.getApi(TanaZoomPlugin).zoom.restore(nodeId, event.state);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [editor]);

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
  const inspectNode = React.useCallback((nodeId: string) => {
    setInspectedNodeId(nodeId);
    setFieldPanelOpen(true);
    setFocusMode(false);
  }, []);
  const closeInspector = React.useCallback(() => {
    setFieldPanelOpen(false);
    setInspectedNodeId(null);
    editor.tf.focus();
  }, [editor]);
  const toggleNavigation = React.useCallback(() => {
    if (narrowWindow) {
      if (focusMode) {
        setFocusMode(false);
        editor.tf.focus();
        return;
      }
      if (sidebarMode === 'hidden') {
        updateWorkspaceUi({ ...workspaceUi, sidebar: { ...workspaceUi.sidebar, mode: 'full' } });
      }
      setNavigationOpen((open) => !open);
    } else {
      const mode: TanaSidebarMode = sidebarMode === 'full'
        ? 'mini'
        : sidebarMode === 'mini'
          ? 'hidden'
          : 'full';
      updateWorkspaceUi({ ...workspaceUi, sidebar: { ...workspaceUi.sidebar, mode } });
    }
  }, [editor, focusMode, narrowWindow, sidebarMode, updateWorkspaceUi, workspaceUi]);
  const resizeInspector = React.useCallback((delta: number) => {
    setInspectorWidth((width) => Math.min(420, Math.max(280, width + delta)));
  }, []);

  const navigateToSearchResult = (nodeId: string) => {
    selectTanaSearchResult(editor, nodeId, setSearch, setSearchOpen);
  };

  const openSearch = React.useCallback(() => {
    setSearch("");
    setSearchOpen(true);
  }, []);

  const openCommandPalette = React.useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  const copyLink = React.useCallback(() => {
    const href = new URL(
      getTanaEditorHref(focusedNodeId),
      window.location.origin,
    ).href;
    void navigator.clipboard?.writeText(href);
  }, [focusedNodeId]);

  const commandTargetNodeId = selectedNodeId ?? focusedNodeId;
  const commandHandlers = React.useMemo<TanaWorkspaceCommandHandlers>(() => {
    return {
      'new-node': createNew,
      'quick-add': openQuickAdd,
      search: openSearch,
      'open-command-palette': openCommandPalette,
      today: () => editor.getTransforms(TanaTimePlugin).time.today(),
      'navigate-back': () => editor.getTransforms(TanaZoomPlugin).zoom.previous(),
      'navigate-forward': () => editor.getTransforms(TanaZoomPlugin).zoom.next(),
      'navigate-root': () => editor.getTransforms(TanaZoomPlugin).zoom.root(),
      'toggle-inspector': () => {
        if (fieldPanelOpen && !focusMode) closeInspector();
        else {
          setInspectedNodeId(null);
          setFieldPanelOpen(true);
          setFocusMode(false);
        }
      },
      'open-field-inspector': () => {
        if (commandTargetNodeId) inspectNode(commandTargetNodeId);
      },
      'toggle-focus-mode': () => {
        setFocusMode((active) => !active);
        setNavigationOpen(false);
        editor.tf.focus();
      },
      'toggle-sidebar': toggleNavigation,
      'copy-link': copyLink,
      undo: () => editor.undo(),
      redo: () => editor.redo(),
      duplicate: () => {
        if (!commandTargetNodeId) return;
        editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set([commandTargetNodeId]));
        editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
      },
      trash: () => {
        if (!commandTargetNodeId) return;
        editor.getTransforms(TanaNodeLifecyclePlugin).node.trash(commandTargetNodeId);
      },
      'toggle-done': () => {
        if (!commandTargetNodeId) return;
        editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity.toggleDone(commandTargetNodeId);
      },
      'collapse-node': () => editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts.collapseCurrentNode(),
      'expand-node': () => editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts.expandCurrentNode(),
    };
  }, [
    closeInspector,
    fieldPanelOpen,
    focusMode,
    inspectNode,
    commandTargetNodeId,
    copyLink,
    createNew,
    editor,
    openCommandPalette,
    openQuickAdd,
    openSearch,
    toggleNavigation,
  ]);

  const runWorkspaceCommand = React.useCallback(
    (command: TanaWorkspaceCommandId) => runTanaWorkspaceCommand(commandHandlers, command),
    [commandHandlers],
  );

  React.useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (!isTauri()) return;
      const { listen } = await import('@tauri-apps/api/event');
      const cleanup = await listen<unknown>('tana-menu-command', (event) => {
        if (!disposed && isTanaWorkspaceCommandId(event.payload)) {
          runWorkspaceCommand(event.payload);
        }
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [runWorkspaceCommand]);

  React.useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if ((key === "s" || key === "k") && !event.shiftKey) {
        event.preventDefault();
        runWorkspaceCommand('search');
      } else if (key === 'p' && !event.shiftKey) {
        event.preventDefault();
        runWorkspaceCommand('open-command-palette');
      } else if (key === "e" && !event.shiftKey) {
        event.preventDefault();
        runWorkspaceCommand('quick-add');
      } else if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        runWorkspaceCommand('toggle-focus-mode');
      } else if (key === "t" && event.shiftKey) {
        event.preventDefault();
        runWorkspaceCommand('today');
      }
    };
    document.addEventListener("keydown", onGlobalKeyDown, true);
    return () => document.removeEventListener("keydown", onGlobalKeyDown, true);
  }, [runWorkspaceCommand]);

  return (
    <TanaInspectorContext.Provider value={inspectNode}>
      <TanaOutlinerOpenState />
      <TanaWorkspaceShell
        focusMode={focusMode}
        navigationOpen={navigationOpen}
        onDismissNavigation={() => setNavigationOpen(false)}
        sidebar={
          <TanaSidebar
            activeNodeId={activeNodeId}
            index={index}
            onCreateNew={createNew}
            onQuickAdd={openQuickAdd}
            onSearch={openSearch}
            onNavigate={() => setNavigationOpen(false)}
            onUpdateUi={updateWorkspaceUi}
            appearance={appearance}
            onAppearanceChange={changeAppearance}
          />
        }
        toolbar={
          <TanaWorkspaceToolbar
            breadcrumbs={breadcrumbs}
            editor={editor}
            fieldPanelOpen={fieldPanelOpen && !focusMode}
            focusedNodeId={focusedNodeId}
            onCommand={runWorkspaceCommand}
            persistenceStatus={persistenceStatus}
            navigationExpanded={navigationExpanded}
            sidebarMode={sidebarMode}
            focusMode={focusMode}
          />
        }
        inspector={fieldPanelOpen && (
          <div
            className="tana-inspector-region"
            style={{ width: inspectorWidth }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) {
                event.stopPropagation();
                closeInspector();
              }
            }}
          >
            <TanaPanelResizer
              aria-label="调整检查器宽度"
              className="absolute inset-y-0 -left-1 z-20"
              direction={-1}
              onResize={resizeInspector}
            />
            <TanaInspector
              activeNodeId={inspectedNodeId ?? selectedNodeId ?? focusedNodeId}
              initialTab={inspectedNodeId ? 'fields' : undefined}
              onClose={closeInspector}
            />
          </div>
        )}
      >
        <TanaNodeViewHost focusedNodeId={focusedNodeId} selectedNodeId={selectedNodeId} />
      </TanaWorkspaceShell>
        <TanaCommandPalette
          open={commandPaletteOpen}
          onCommand={runWorkspaceCommand}
          onOpenChange={setCommandPaletteOpen}
        />

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
            <DialogDescription>搜索标题、字段、标签和引用。</DialogDescription>
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
            if (!open && captureDraftHasText(quickAddDraftRef.current)) {
              updateWorkspaceUi({
                ...workspaceUi,
                quickAddDraft: quickAddDraftRef.current,
              });
            }
            setQuickAddOpen(open);
          }}
        >
          <DialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
            <DialogTitle>Quick Add</DialogTitle>
            <DialogDescription>添加到 Today；Esc 保留草稿。</DialogDescription>
            <TanaCaptureComposer
              key={`quick-add-${quickAddSession}`}
              ariaLabel="Quick Add 草稿"
              document={editor.children}
              index={index}
              draft={quickAddDraft}
              onChange={(draft) => {
                setQuickAddDraft(draft);
                quickAddDraftRef.current = draft;
                updateWorkspaceUi({
                  ...workspaceUi,
                  quickAddDraft: draft,
                });
              }}
              onSubmit={() => submitQuickAdd()}
              onCancel={() => setQuickAddOpen(false)}
            />
          </DialogContent>
        </Dialog>

    </TanaInspectorContext.Provider>
  );
}
