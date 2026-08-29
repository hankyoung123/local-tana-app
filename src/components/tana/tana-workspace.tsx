'use client';

import * as React from 'react';

import { ChevronRightIcon } from 'lucide-react';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { SettingsDialog } from '@/components/editor/settings-dialog';
import { Editor, EditorContainer } from '@/components/ui/editor';
import {
  buildTanaIndex,
  navigateToNode,
  type NodeId,
} from '@/lib/tana';

import { TanaInspector } from './tana-inspector';
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
  const derived = useEditorSelector(
    (currentEditor) => {
      const selectedBlock = currentEditor.api.block()?.[0];

      return {
        index: buildTanaIndex(currentEditor.children),
        selectedNodeId:
          selectedBlock && typeof selectedBlock.id === 'string'
            ? selectedBlock.id
            : null,
      };
    },
    []
  );

  const handleNavigate = (nodeId: NodeId) => {
    if (activeViewId) {
      setActiveViewId(null);
      requestAnimationFrame(() => navigateToNode(editor, nodeId));

      return;
    }

    navigateToNode(editor, nodeId);
  };

  const handleOpenView = (nodeId: NodeId) => {
    navigateToNode(editor, nodeId);
    setActiveViewId(nodeId);
  };

  const activeView = activeViewId
    ? derived.index.nodesById.get(activeViewId)
    : undefined;

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-[#f4f6f5] text-[#202421]">
      <header className="flex h-12 shrink-0 items-center border-b border-[#dfe4e1] bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <div className="flex shrink-0 items-center gap-2">
            <span className="grid size-6 place-items-center rounded bg-[#1f6f52] font-semibold text-[11px] text-white">
              LT
            </span>
            <span className="font-semibold text-[13px]">Local Tana</span>
          </div>

          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1 text-[#6d746f] text-xs"
          >
            <span className="truncate">Workspace</span>
            <ChevronRightIcon className="size-3.5 shrink-0" />
            <span className="truncate font-medium text-[#343a36]">Home</span>
          </nav>
        </div>

        <p className="ml-3 shrink-0 text-[10px] text-muted-foreground">
          {persistenceStatus === 'browser-preview' && 'Browser preview'}
          {persistenceStatus === 'saving' && 'Saving…'}
          {persistenceStatus === 'saved' && 'Saved to SQLite'}
          {persistenceStatus === 'error' && 'Save failed'}
        </p>
      </header>

      <main className="flex min-h-0 flex-1">
        <TanaSidebar
          index={derived.index}
          onNavigate={handleNavigate}
          onOpenView={handleOpenView}
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
            <p className="mb-1 text-[#7b827d] text-xs">Workspace</p>
            <h1 className="font-semibold text-2xl text-[#202421] tracking-normal">
              Home
            </h1>
          </div>

          <EditorContainer className="min-h-0 flex-1" variant="default">
            <Editor
              className="h-full px-8 pt-5 pb-40 text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]"
              placeholder="Add a node..."
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

      <SettingsDialog />
    </div>
  );
}
