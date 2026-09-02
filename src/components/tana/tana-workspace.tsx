'use client';

import * as React from 'react';

import { useEditorRef, useEditorSelector, usePluginOption } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Input } from '@/components/ui/input';
import {
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeElement,
  searchTanaNodes,
} from '@/lib/tana';

import { TanaIndexProvider, useTanaIndex } from './tana-index-context';
import { TanaInspector } from './tana-inspector';
import { TanaNodeViewHost } from './tana-node-view-host';
import { getNodeRenderer } from './node-renderer-registry';
import { TanaOutlinerOpenState } from './tana-outliner-open-state';
import { TanaSidebar } from './tana-sidebar';

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
  return (
    <TanaIndexProvider>
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
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [fieldPanelOpen, setFieldPanelOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const focusedNodeId =
    usePluginOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
  const selectedNodeId = useEditorSelector(
    (currentEditor) => {
      const selectedTopLevel = currentEditor.selection
        ? currentEditor.children[currentEditor.selection.anchor.path[0]]
        : undefined;
      const selectedTopLevelPath = currentEditor.selection
        ? [currentEditor.selection.anchor.path[0]]
        : undefined;

      return (
        selectedTopLevel &&
        selectedTopLevelPath &&
        isTanaNodeElement(selectedTopLevel, selectedTopLevelPath) &&
        typeof selectedTopLevel.id === 'string'
          ? selectedTopLevel.id
          : null
      );
    },
    []
  );

  const focusedNodeExists = useEditorSelector(
    (currentEditor) =>
      !focusedNodeId || !!currentEditor.api.node({ at: [], id: focusedNodeId }),
    [focusedNodeId]
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
        node && 'id' in node && typeof node.id === 'string' ? [node.id] : []
      );
  }, [editor, focusedNodeId, index]);

  const breadcrumbs = breadcrumbNodeIds.flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node ? [node] : [];
  });
  const searchResults = searchTanaNodes(index, search);
  const SearchResultRenderer = getNodeRenderer('search').SearchResult;
  const activeNodeId = focusedNodeId ?? selectedNodeId;

  const navigateToSearchResult = (nodeId: string) => {
    editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
    setSearch('');
    setSearchOpen(false);
  };

  return (
    <div className="flex h-dvh min-w-0 bg-[#f7f9f8] text-[#202421]">
      <TanaOutlinerOpenState />
      <TanaSidebar
        activeNodeId={activeNodeId}
        collapsed={sidebarCollapsed}
        index={index}
        onCollapsedChange={setSidebarCollapsed}
        workspaceRootActive={!focusedNodeId}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex h-11 shrink-0 items-center border-b border-[#e6ebe8] bg-white px-5">
          <nav
            aria-label="路径导航"
            className="flex min-w-0 flex-1 items-center gap-1 text-[#7b827d] text-xs"
          >
            <button
              className="truncate hover:text-[#202421] disabled:text-[#202421]"
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
                  <span aria-hidden="true" className="text-[#b0b6b2]">
                    /
                  </span>
                  {isCurrent ? (
                    <span className="truncate font-medium text-[#343a36]">
                      {node.text || '未命名节点'}
                    </span>
                  ) : (
                    <button
                      className="truncate hover:text-[#202421]"
                      type="button"
                      onClick={() =>
                        editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)
                      }
                    >
                      {node.text || '未命名节点'}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <div className="ml-4 flex shrink-0 items-center gap-3 text-xs">
            {persistenceStatus === 'saving' && (
              <span className="text-[#7b827d]">正在保存…</span>
            )}
            {persistenceStatus === 'error' && (
              <span className="font-medium text-destructive">保存失败</span>
            )}
            {persistenceStatus === 'browser-preview' && (
              <span className="text-[#8b938d]">浏览器预览</span>
            )}
            <button
              className="text-[#527664] hover:text-[#1f6f52]"
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
            >
              搜索
            </button>
            <button
              aria-pressed={fieldPanelOpen}
              className={
                fieldPanelOpen
                  ? 'font-medium text-[#1f6f52]'
                  : 'text-[#527664] hover:text-[#1f6f52]'
              }
              type="button"
              onClick={() => setFieldPanelOpen((open) => !open)}
            >
              字段
            </button>
          </div>

          {searchOpen && (
            <div className="absolute top-10 right-4 z-50 w-80 border border-[#e1e7e3] bg-white p-2 shadow-sm">
              <Input
                autoFocus
                aria-label="搜索所有节点"
                className="h-8 border-0 bg-[#f6f8f7] text-xs shadow-none focus-visible:ring-1"
                placeholder="搜索所有节点"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchOpen(false);
                    setSearch('');
                  }
                }}
              />
              {search.trim() && (
                <div className="mt-2 max-h-72 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="px-2 py-2 text-[#7b827d] text-xs">没有匹配的节点</p>
                  ) : (
                    searchResults.map((node) =>
                      SearchResultRenderer ? (
                        <SearchResultRenderer
                          key={node.id}
                          node={node}
                          onNavigate={navigateToSearchResult}
                        />
                      ) : null
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <TanaNodeViewHost
            focusedNodeId={focusedNodeId}
            selectedNodeId={selectedNodeId}
          />
          {fieldPanelOpen && <TanaInspector activeNodeId={activeNodeId} />}
        </div>
      </main>
    </div>
  );
}
