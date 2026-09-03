import { ElementApi } from 'platejs';
import type { Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

export const TANA_REFERENCE_PLUGIN_KEY = 'tanaReference' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, Path])
    : undefined;
}

function setTarget(editor: PlateEditor, referenceNodeId: NodeId, targetNodeId: NodeId): boolean {
  const reference = getTanaNodeEntry(editor, referenceNodeId);
  const target = getTanaNodeEntry(editor, targetNodeId);

  if (
    !reference ||
    !target ||
    referenceNodeId === targetNodeId ||
    reference[0].tanaSystemNode !== undefined ||
    reference[0].tanaReferenceTargetId !== undefined
  ) {
    return false;
  }

  editor.tf.setNodes({ tanaReferenceTargetId: targetNodeId }, { at: reference[1] });

  return true;
}

function setTargetTitle(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  targetNodeId: NodeId,
  title: string
): boolean {
  const target = getTanaNodeEntry(editor, targetNodeId);

  if (!target || target[0].tanaSystemNode !== undefined) return false;
  if (target[0].children.length === 1 && target[0].children[0]?.text === title) return false;

  // Slate cannot replace an element's child list with setNodes. Reinsert the
  // same canonical Plate Node at the same path: its NodeId and all Tana
  // metadata remain intact, while the reference itself owns no copied title.
  editor.tf.withoutNormalizing(() => {
    removeNodes({ at: target[1] });
    editor.tf.insertNodes(
      { ...target[0], children: [{ text: title }] },
      { at: target[1] }
    );
  });

  return true;
}

/** Owns block-reference target mutations; projection rendering remains read-only. */
export const TanaReferencePlugin = createPlatePlugin({
  key: TANA_REFERENCE_PLUGIN_KEY,
  priority: 0,
})
  .extendEditorTransforms(() => ({
    reference: {
      setTarget: (referenceNodeId: NodeId, targetNodeId: NodeId): boolean => {
        void referenceNodeId;
        void targetNodeId;
        return false;
      },
      setTargetTitle: (targetNodeId: NodeId, title: string): boolean => {
        void targetNodeId;
        void title;
        return false;
      },
    },
  }))
  .overrideEditor(({ editor, tf: { removeNodes } }) => ({
    transforms: {
      reference: {
        setTarget: (referenceNodeId: NodeId, targetNodeId: NodeId) =>
          setTarget(editor, referenceNodeId, targetNodeId),
        setTargetTitle: (targetNodeId: NodeId, title: string) =>
          setTargetTitle(editor, removeNodes, targetNodeId, title),
      },
    },
  }));
