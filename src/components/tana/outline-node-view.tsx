'use client';

import * as React from 'react';

import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import type { NodeId } from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';

/** Renders the Plate editor and focuses a Zoom target only after it has mounted. */
export function OutlineNodeView({
  focusedNodeId,
  selectedNodeId,
}: {
  focusedNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const activeNodeId = focusedNodeId ?? selectedNodeId;
  const activeNode = activeNodeId ? index.nodesById.get(activeNodeId) : undefined;

  React.useEffect(() => {
    if (!focusedNodeId) return;

    editor.getApi(TanaZoomPlugin).zoom.focus(focusedNodeId);
  }, [editor, focusedNodeId]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[#e7ebe8] px-6 py-5 sm:px-[max(48px,calc(50%-390px))]">
        <p className="mb-1 text-[#7b827d] text-xs">工作区</p>
        <h1 className="font-semibold text-2xl text-[#202421] tracking-normal">
          {activeNode?.text || '工作区'}
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
  );
}
