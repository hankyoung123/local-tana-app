'use client';

import * as React from 'react';

import { ElementApi } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { type NodeId } from '@/lib/tana';
import { getNodeSemanticType } from '@/lib/tana/node-semantic';
import { getTanaDirectChildPaths } from '@/lib/tana/outliner';

import { useTanaIndex } from './tana-index-context';
import { TanaReferencesSection } from './tana-references-section';
import { TanaZoomPresentationProvider } from './tana-zoom-presentation';
/** Renders the Plate editor and focuses a Zoom target only after it has mounted. */
export function OutlineNodeView({
  focusedNodeId,
}: {
  focusedNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const baseIndent = useEditorSelector(
    (currentEditor) => {
      if (!focusedNodeId) return null;

      const entry = currentEditor.api.node({ at: [], id: focusedNodeId });

      return entry && typeof entry[0].indent === 'number' ? entry[0].indent : 0;
    },
    [focusedNodeId]
  );
  const hasBodyContent = useEditorSelector(
    (currentEditor) => {
      if (!focusedNodeId) return false;
      const entry = currentEditor.api.node({ at: [], id: focusedNodeId });
      if (!entry) return false;

      return getTanaDirectChildPaths(currentEditor.children, entry[1]).some((path) => {
        const child = currentEditor.api.node(path)?.[0];
        return !!child && ElementApi.isElement(child) && getNodeSemanticType(child, {
          document: currentEditor.children,
          path,
        }) === 'content';
      });
    },
    [focusedNodeId]
  );

  React.useEffect(() => {
    if (!focusedNodeId) return;

    editor.getApi(TanaZoomPlugin).zoom.focus(focusedNodeId);
  }, [editor, focusedNodeId]);

  return (
    <TanaZoomPresentationProvider
      baseIndent={baseIndent ?? 0}
    >
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--tana-canvas)]">
        <EditorContainer className="min-h-0 flex-1" variant="default">
          <Editor
            className="px-8 pt-10 pb-40 text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]"
            variant="none"
          />
          {focusedNodeId && !hasBodyContent && (
            <button
              aria-label="输入内容…"
              className="absolute left-8 top-[5.75rem] rounded px-1 text-left text-[15px] text-muted-foreground/80 hover:bg-[var(--tana-hover)] sm:left-[max(64px,calc(50%-374px))]"
              type="button"
              onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild()}
            >
              输入内容…
            </button>
          )}
          {focusedNodeId && (
            <div className="px-8 pb-12 sm:px-[max(64px,calc(50%-374px))]">
              <TanaReferencesSection index={index} nodeId={focusedNodeId} />
            </div>
          )}
        </EditorContainer>
      </section>
    </TanaZoomPresentationProvider>
  );
}
