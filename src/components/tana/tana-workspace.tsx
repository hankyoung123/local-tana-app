'use client';

import * as React from 'react';

import {
  CornerDownLeftIcon,
  PanelRightIcon,
  SearchIcon,
} from 'lucide-react';
import {
  useEditorRef,
  useEditorSelector,
  useHotkeys,
  usePluginOption,
} from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeElement,
  searchTanaNodes,
  type TanaNode,
} from '@/lib/tana';

import { TanaIndexProvider, useTanaIndex } from './tana-index-context';
import { TanaInspector } from './tana-inspector';
import { TanaNodeViewHost } from './tana-node-view-host';
import { TanaOutlinerOpenState } from './tana-outliner-open-state';
import { TanaSidebar } from './tana-sidebar';

export type PersistenceStatus =
  | 'browser-preview'
  | 'error'
  | 'saved'
  | 'saving';

function SearchResult({
  node,
  onNavigate,
}: {
  node: TanaNode;
  onNavigate: (nodeId: string) => void;
}) {
  return (
    <CommandItem
      className="group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[#eef3f0]"
      value={`${node.text} ${node.id}`}
      onSelect={() => onNavigate(node.id)}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded bg-[#e6eee9] text-[#4f725f] text-[10px]">
        {node.semanticType === 'supertag-definition' ? '#' : '•'}
      </span>
      <span className="min-w-0 flex-1 truncate">{node.text || '未命名节点'}</span>
      <span className="opacity-0 text-[#8f9792] group-hover:opacity-100">
        <CornerDownLeftIcon className="size-3" />
      </span>
    </CommandItem>
  );
}

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
  const activeNodeId = focusedNodeId ?? selectedNodeId;

  const navigateToSearchResult = (nodeId: string) => {
    editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
    setSearch('');
    setSearchOpen(false);
  };

  const openSearch = React.useCallback(() => {
    setSearch('');
    setSearchOpen(true);
  }, []);

  const hotkeyRef = useHotkeys<HTMLDivElement>(
    'mod+p',
    openSearch,
    {
      enableOnContentEditable: true,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [openSearch]
  );

  return (
    <div
      ref={hotkeyRef}
      className="flex h-dvh min-w-0 bg-[#f6f8f6] text-[#202421]"
    >
      <TanaOutlinerOpenState />
      <TanaSidebar
        activeNodeId={activeNodeId}
        collapsed={sidebarCollapsed}
        index={index}
        onCollapsedChange={setSidebarCollapsed}
        onOpenSearch={openSearch}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex h-12 shrink-0 items-center border-b border-[#e6ebe8] bg-white/95 px-5">
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
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[#527664] hover:bg-[#f1f5f2] hover:text-[#1f6f52]"
              type="button"
              onClick={openSearch}
            >
              <SearchIcon className="size-3.5" />
              搜索
              <kbd className="ml-1 text-[#a1a8a3] text-[10px]">⌘P</kbd>
            </button>
            <button
              aria-pressed={fieldPanelOpen}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-[#f1f5f2] ${
                fieldPanelOpen
                  ? 'bg-[#eaf1ed] font-medium text-[#1f6f52]'
                  : 'text-[#527664] hover:text-[#1f6f52]'
              }`}
              type="button"
              onClick={() => setFieldPanelOpen((open) => !open)}
            >
              <PanelRightIcon className="size-3.5" />
              检查器
            </button>
          </div>

          {searchOpen && (
            <div className="absolute top-12 right-4 z-50 w-[22rem] overflow-hidden rounded-xl border border-[#dfe6e1] bg-white p-2 shadow-[0_18px_50px_rgb(28_48_38/0.16)]">
              <Command
                shouldFilter={false}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchOpen(false);
                    setSearch('');
                  }
                }}
              >
                <div className="mb-1 flex items-center gap-2 px-2 text-[#87908a] text-[10px] uppercase tracking-[0.1em]">
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
                            node={node}
                            onNavigate={navigateToSearchResult}
                          />
                        ))}
                      </CommandGroup>
                    </>
                  ) : (
                    <p className="px-2.5 py-5 text-center text-[#8b938d] text-xs">
                      输入关键词搜索所有节点
                    </p>
                  )}
                </CommandList>
                <div className="mt-1 flex items-center justify-between border-t border-[#eef1ef] px-2 pt-2 text-[#9aa19d] text-[10px]">
                  <span>↑↓ 选择 · Enter 打开</span>
                  <span>Esc 关闭</span>
                </div>
              </Command>
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
