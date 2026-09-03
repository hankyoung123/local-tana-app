'use client';

import * as React from 'react';

import { useEditorRef, useEditorSelector } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { isTanaFieldHostNode, type NodeId } from '@/lib/tana';

/** Renders the Plate editor and focuses a Zoom target only after it has mounted. */
export function OutlineNodeView({
  focusedNodeId,
}: {
  focusedNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
}) {
  const editor = useEditorRef();
  const canInsertBodyChild = useEditorSelector(
    (currentEditor) => {
      if (!focusedNodeId) return false;

      const entry = currentEditor.api.node({ at: [], id: focusedNodeId });

      return !!entry && isTanaFieldHostNode(currentEditor.children, entry[1]);
    },
    [focusedNodeId]
  );

  React.useEffect(() => {
    if (!focusedNodeId) return;

    editor.getApi(TanaZoomPlugin).zoom.focus(focusedNodeId);
  }, [editor, focusedNodeId]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <EditorContainer className="min-h-0 flex-1" variant="default">
        <Editor
          className="h-full px-8 pt-10 pb-40 text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]"
          placeholder="新建节点…"
          variant="none"
        />
        {canInsertBodyChild && (
          <button
            className="absolute right-8 bottom-8 rounded-md px-3 py-2 text-left text-[#8b938d] text-sm hover:bg-[#f1f5f2] hover:text-[#527664] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bb69b] sm:right-[max(64px,calc(50%-374px))]"
            type="button"
            onClick={() =>
              editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild()
            }
          >
            输入内容…
          </button>
        )}
      </EditorContainer>
    </section>
  );
}
