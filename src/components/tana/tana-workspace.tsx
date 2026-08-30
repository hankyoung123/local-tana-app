'use client';

import * as React from 'react';

import { ChevronRightIcon } from 'lucide-react';
import { useEditorRef, useEditorSelector, usePluginOption } from 'platejs/react';

import { Editor, EditorContainer } from '@/components/ui/editor';
import {
  buildTanaIndex,
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeElement,
  resetInvalidTanaZoom,
  type NodeId,
  zoomOutTanaNode,
  zoomToTanaNode,
  zoomToTanaWorkspaceRoot,
} from '@/lib/tana';
import { TanaZoomPlugin } from '@/lib/tana/zoom';

import { TanaInspector } from './tana-inspector';
import { TanaNavigationProvider } from './tana-navigation-context';
import { TanaOutlinerOpenState } from './tana-outliner-open-state';
import { TanaSidebar } from './tana-sidebar';
import { TanaView } from './tana-view';

export type PersistenceStatus =
  | 'browser-preview'
  | 'error'
  | 'saved'
  | 'saving';

export function TanaWorkspace({
  persistenceStatus,
}: {
  persistenceStatus: PersistenceStatus;
}) {
  const editor = useEditorRef();
  const [activeViewId, setActiveViewId] = React.useState<NodeId | null>(null);
  const focusedNodeId =
    usePluginOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
  const derived = useEditorSelector(
    (currentEditor) => {
      const selectedTopLevel = currentEditor.selection
        ? currentEditor.children[currentEditor.selection.anchor.path[0]]
        : undefined;
      const selectedTopLevelPath = currentEditor.selection
        ? [currentEditor.selection.anchor.path[0]]
        : undefined;

      return {
        index: buildTanaIndex(currentEditor.children),
        selectedNodeId:
          selectedTopLevel &&
          selectedTopLevelPath &&
          isTanaNodeElement(selectedTopLevel, selectedTopLevelPath) &&
          typeof selectedTopLevel.id === 'string'
            ? selectedTopLevel.id
            : null,
      };
    },
    []
  );

  const zoomToNode = React.useCallback(
    (nodeId: NodeId) => {
      setActiveViewId(null);
      zoomToTanaNode(editor, nodeId);
    },
    [editor]
  );

  const zoomOut = React.useCallback(() => {
    setActiveViewId(null);
    zoomOutTanaNode(editor);
  }, [editor]);

  const zoomToWorkspaceRoot = React.useCallback(() => {
    setActiveViewId(null);
    zoomToTanaWorkspaceRoot(editor);
  }, [editor]);

  const handleNavigate = React.useCallback(
    (nodeId: NodeId) => {
      zoomToNode(nodeId);
    },
    [zoomToNode]
  );

  const handleOpenView = React.useCallback((nodeId: NodeId) => {
    if (!zoomToTanaNode(editor, nodeId)) return;

    setActiveViewId(nodeId);
  }, [editor]);

  const focusedNodeExists = useEditorSelector(
    (currentEditor) =>
      !focusedNodeId || !!currentEditor.api.node({ at: [], id: focusedNodeId }),
    [focusedNodeId]
  );

  React.useEffect(() => {
    if (!focusedNodeExists) resetInvalidTanaZoom(editor);
  }, [editor, focusedNodeExists]);

  const navigation = React.useMemo(
    () => ({
      navigateToNode: handleNavigate,
      zoomOut,
      zoomToNode,
    }),
    [handleNavigate, zoomOut, zoomToNode]
  );

  const breadcrumbNodeIds = React.useMemo(() => {
    if (!focusedNodeId || !derived.index.nodesById.has(focusedNodeId)) {
      return [];
    }

    const focusedPath = getTanaNodePath(editor.children, focusedNodeId);

    if (!focusedPath) return [];

    return [...getTanaAncestorPaths(editor.children, focusedPath), focusedPath]
      .map((path) => editor.api.node(path)?.[0])
      .flatMap((node) =>
        node && 'id' in node && typeof node.id === 'string' ? [node.id] : []
      );
  }, [derived.index, editor, focusedNodeId]);

  const breadcrumbs = breadcrumbNodeIds.flatMap((nodeId) => {
    const node = derived.index.nodesById.get(nodeId);

    return node ? [node] : [];
  });

  const activeView = activeViewId
    ? derived.index.nodesById.get(activeViewId)
    : undefined;
  const activeNodeId = activeViewId ?? focusedNodeId ?? derived.selectedNodeId;
  const activeNode = activeNodeId
    ? derived.index.nodesById.get(activeNodeId)
    : undefined;
  const pageTitle = activeNode?.text || '工作区';

  return (
    <TanaNavigationProvider value={navigation}>
      <div className="flex h-dvh min-w-0 flex-col bg-[#f4f6f5] text-[#202421]">
        <TanaOutlinerOpenState />
        <header className="flex h-12 shrink-0 items-center border-b border-[#dfe4e1] bg-white px-4">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <div className="flex shrink-0 items-center gap-2">
              <span className="grid size-6 place-items-center rounded bg-[#1f6f52] font-semibold text-[11px] text-white">
                LT
              </span>
              <span className="font-semibold text-[13px]">Local Tana</span>
            </div>

            <nav
              aria-label="路径导航"
              className="flex min-w-0 items-center gap-1 text-[#6d746f] text-xs"
            >
              <button
                className="truncate hover:text-[#343a36] disabled:text-[#343a36]"
                disabled={!focusedNodeId}
                onClick={zoomToWorkspaceRoot}
                type="button"
              >
                工作区
              </button>
              {breadcrumbs.map((node, index) => {
                const isCurrent = index === breadcrumbs.length - 1;

                return (
                  <React.Fragment key={node.id}>
                    <ChevronRightIcon className="size-3.5 shrink-0" />
                    {isCurrent ? (
                      <span className="truncate font-medium text-[#343a36]">
                        {node.text || '未命名节点'}
                      </span>
                    ) : (
                      <button
                        className="truncate hover:text-[#343a36]"
                        onClick={() => zoomToNode(node.id)}
                        type="button"
                      >
                        {node.text || '未命名节点'}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          <p className="ml-3 shrink-0 text-[10px] text-muted-foreground">
            {persistenceStatus === 'browser-preview' && '浏览器预览'}
            {persistenceStatus === 'saving' && '正在保存…'}
            {persistenceStatus === 'saved' && '已保存到 SQLite'}
            {persistenceStatus === 'error' && '保存失败'}
          </p>
        </header>

        <main className="flex min-h-0 flex-1">
          <TanaSidebar
            activeNodeId={activeNodeId}
            index={derived.index}
            onNavigate={handleNavigate}
            onOpenView={handleOpenView}
            onWorkspaceRoot={zoomToWorkspaceRoot}
            workspaceRootActive={!focusedNodeId && !activeViewId}
          />

          {activeView?.viewDefinition ? (
            <TanaView
              index={derived.index}
              view={activeView}
              onBack={() => setActiveViewId(null)}
              onNavigate={handleNavigate}
            />
          ) : (
            <section className="flex min-w-0 flex-1 flex-col bg-white">
              <div className="shrink-0 border-b border-[#e7ebe8] px-6 py-5 sm:px-[max(48px,calc(50%-390px))]">
                <p className="mb-1 text-[#7b827d] text-xs">工作区</p>
                <h1 className="font-semibold text-2xl text-[#202421] tracking-normal">
                  {pageTitle}
                </h1>
              </div>

              <EditorContainer className="min-h-0 flex-1" variant="default">
                <Editor
                  className="h-full px-8 pt-5 pb-40 text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]"
                  placeholder="新建节点…"
                  variant="none"
                />
              </EditorContainer>
            </section>
          )}

          <TanaInspector
            editor={editor}
            index={derived.index}
            selectedNodeId={activeViewId ?? derived.selectedNodeId}
            onNavigate={handleNavigate}
          />
        </main>
      </div>
    </TanaNavigationProvider>
  );
}
