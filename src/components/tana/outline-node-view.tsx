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
  const bodyChildIndent = useEditorSelector(
    (currentEditor) => {
      if (!focusedNodeId) return null;

      const entry = currentEditor.api.node({ at: [], id: focusedNodeId });

      if (!entry || !isTanaFieldHostNode(currentEditor.children, entry[1])) {
        return null;
      }

      return typeof entry[0].indent === 'number' ? entry[0].indent + 1 : 1;
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
          className="px-8 pt-10 pb-2 text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]"
          placeholder="新建节点…"
          variant="none"
        />
        {bodyChildIndent !== null && (
          <div className="px-8 pb-40 sm:px-[max(64px,calc(50%-374px))]">
            <button
              className="block min-h-6 w-full rounded-sm text-left text-[#a1a8a3] text-sm hover:bg-[#f6f8f6] hover:text-[#527664] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bb69b]"
              type="button"
              style={{ paddingInlineStart: `${bodyChildIndent * 24}px` }}
              onClick={() =>
                editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild()
              }
            >
              输入内容…
            </button>
          </div>
        )}
      </EditorContainer>
    </section>
  );
}
