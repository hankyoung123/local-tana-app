'use client';

import * as React from 'react';

import { useEditorRef, useEditorSelector } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { type NodeId } from '@/lib/tana';

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

  React.useEffect(() => {
    if (!focusedNodeId) return;

    // A focused page exposes its last empty direct child through Plate itself.
    // The transform only creates that canonical child; focus, IME, history, and
    // all subsequent editing stay inside the mounted Plate editor.
    editor.getTransforms(TanaZoomPlugin).zoom.ensureBodyChild();
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
