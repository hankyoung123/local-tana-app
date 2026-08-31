'use client';

import * as React from 'react';

import { ChevronRightIcon } from 'lucide-react';
import { useEditorRef, useEditorSelector, usePluginOption } from 'platejs/react';

import {
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeElement,
} from '@/lib/tana';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';

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
    if (!focusedNodeId || !index.nodesById.has(focusedNodeId)) {
      return [];
    }

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

  const activeNodeId = focusedNodeId ?? selectedNodeId;

  return (
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
              onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.root()}
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
                      onClick={() =>
                        editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)
                      }
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
          index={index}
          workspaceRootActive={!focusedNodeId}
        />

        <TanaNodeViewHost
          focusedNodeId={focusedNodeId}
          selectedNodeId={selectedNodeId}
        />

        <TanaInspector activeNodeId={activeNodeId} editor={editor} />
      </main>
    </div>
  );
}
