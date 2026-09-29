'use client';

import * as React from 'react';

import { ElementApi } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import {
  isEmptyZoomBodyChild,
  TanaZoomPlugin,
} from '@/components/editor/plugins/tana-zoom-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { TanaNodeBullet } from '@/components/tana/tana-node-gutter';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import { getTanaDirectChildPaths } from '@/lib/tana/outliner';
import { getNodeSemanticType, type NodeId } from '@/lib/tana';

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
  const bodyAffordanceMaterialized = React.useRef(false);
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

      const bodyChildren = getTanaDirectChildPaths(
        currentEditor.children,
        entry[1]
      ).filter((path) => {
        const child = currentEditor.api.node(path);

        return (
          !!child &&
          ElementApi.isElement(child[0]) &&
          getNodeSemanticType(child[0], {
            document: currentEditor.children,
            path,
          }) === 'content'
        );
      });
      const trailingBody = bodyChildren.at(-1);

      // A page with only Field/Value Nodes still receives a first input row.
      // Once a body Node has content, keep the affordance after it; an empty
      // Plate Node uses its own native placeholder instead of a duplicate.
      return !trailingBody || !isEmptyZoomBodyChild(currentEditor, trailingBody);
    },
    [focusedNodeId]
  );
  const materializeBodyInput = React.useCallback(
    (text?: string) => {
      const inserted = bodyAffordanceMaterialized.current ||
        editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild();

      if (!inserted) return;

      bodyAffordanceMaterialized.current = true;
      if (text) editor.tf.insertText(text);
      editor.tf.focus();
    },
    [editor]
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
            <div className="px-8 sm:px-[max(64px,calc(50%-374px))]">
              <div
                aria-label="输入内容…"
                className="tana-bodyAffordance slate-blockWrapper relative flow-root block h-8 min-h-8 w-full border-0 bg-transparent px-0 py-1 text-left text-[15px] leading-6 outline-none"
                role="textbox"
                tabIndex={0}
                style={{
                  paddingInlineStart: `${getTanaDisplayIndentPx(
                    (baseIndent ?? 0) + 1,
                    baseIndent ?? 0
                  )}px`,
                }}
                onMouseDown={() => {
                  bodyAffordanceMaterialized.current = false;
                }}
                onKeyDown={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.nativeEvent.isComposing ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.key.length !== 1
                  ) {
                    return;
                  }

                  event.preventDefault();
                  materializeBodyInput(event.key);
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text/plain');

                  if (!text) return;

                  event.preventDefault();
                  materializeBodyInput(text);
                }}
                onCompositionEnd={(event) => {
                  if (event.data) materializeBodyInput(event.data);
                }}
              >
                <span
                  aria-hidden="true"
                  className="tana-bodyAffordanceBullet pointer-events-none absolute left-1 top-0 grid size-5 place-items-center leading-none"
                  style={{ lineHeight: 0, transform: 'translateY(4px)' }}
                >
                  <TanaNodeBullet semanticType="content" />
                </span>
                <span className="tana-bodyAffordanceLabel">输入内容…</span>
              </div>
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
