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

  const materializeBodyInput = (input: HTMLInputElement) => {
    const text = input.value;

    if (!text) return;

    if (editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild()) {
      editor.tf.insertText(text);
      input.value = '';
    }
  };

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
            <input
              aria-label="新建正文节点"
              className="block min-h-6 w-full rounded-sm bg-transparent text-left text-[#202421] text-sm placeholder:text-[#a1a8a3] hover:bg-[#f6f8f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bb69b]"
              placeholder="输入内容…"
              type="text"
              style={{ paddingInlineStart: `${bodyChildIndent * 24}px` }}
              onInput={(event) => {
                if ((event.nativeEvent as InputEvent).isComposing) return;

                materializeBodyInput(event.currentTarget);
              }}
              onCompositionEnd={(event) => {
                materializeBodyInput(event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>
        )}
      </EditorContainer>
    </section>
  );
}
