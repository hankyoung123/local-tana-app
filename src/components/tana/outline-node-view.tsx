'use client';

import * as React from 'react';

import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import type { NodeId } from '@/lib/tana';

/** Renders the Plate editor and focuses a Zoom target only after it has mounted. */
export function OutlineNodeView({
  focusedNodeId,
}: {
  focusedNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
}) {
  const editor = useEditorRef();

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
      </EditorContainer>
    </section>
  );
}
