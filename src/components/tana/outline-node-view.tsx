'use client';

import * as React from 'react';

import { useEditorRef, useEditorSelector } from 'platejs/react';

import {
  isEmptyZoomBodyChild,
  TanaZoomPlugin,
} from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { TanaNodeBullet } from '@/components/tana/tana-node-gutter';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import { getTanaDirectChildPaths } from '@/lib/tana/outliner';
import { type NodeId } from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import { TanaReferencesSection } from './tana-references-section';
import { getTanaDisplayIndentPx } from './tana-presentation';
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
  const showBodyAffordance = useEditorSelector(
    (currentEditor) => {
      if (!focusedNodeId) return false;

      const entry = currentEditor.api.node({ at: [], id: focusedNodeId });
      if (!entry || !isTanaFieldHostNode(currentEditor.children, entry[1])) {
        return false;
      }

      const trailingChild = getTanaDirectChildPaths(
        currentEditor.children,
        entry[1]
      ).at(-1);

      return !trailingChild || !isEmptyZoomBodyChild(currentEditor, trailingChild);
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
            className={`px-8 pt-10 ${showBodyAffordance ? 'pb-0' : 'pb-8'} text-[15px] leading-6 sm:px-[max(64px,calc(50%-374px))]`}
            variant="none"
          />
          {focusedNodeId && showBodyAffordance && (
            <div className="mt-2 px-8 sm:px-[max(64px,calc(50%-374px))]">
              <button
                aria-label="输入内容…"
                className="slate-blockWrapper relative flow-root block h-8 min-h-8 w-full border-0 bg-transparent p-0 text-left text-[15px] leading-8 text-muted-foreground/80 outline-none transition-colors hover:text-muted-foreground focus-visible:bg-[var(--tana-hover)]"
                style={{
                  paddingInlineStart: `${getTanaDisplayIndentPx(
                    (baseIndent ?? 0) + 1,
                    baseIndent ?? 0
                  )}px`,
                }}
                type="button"
                onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild()}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2"
                >
                  <TanaNodeBullet semanticType="content" />
                </span>
                <span>输入内容…</span>
              </button>
            </div>
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
