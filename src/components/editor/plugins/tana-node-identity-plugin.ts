import { ElementApi, nanoid } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaNodePath
} from '@/lib/tana/outliner';
import type { TanaBlockElement } from '@/lib/tana/types';

export const TANA_NODE_IDENTITY_PLUGIN_KEY = 'tanaNodeIdentity' as const;

const TANA_SEMANTIC_KEYS = [
  'tanaFieldDefinition',
  'tanaFieldId',
  'tanaFieldValueType',
  'tanaPresentation',
  'tanaSupertagDefinition',
  'tanaViewDefinition'
] as const;

function getTanaNodeAtCollapsedSelection(editor: PlateEditor) {
  const selection = editor.selection;

  if (
    !selection ||
    selection.anchor.offset !== selection.focus.offset ||
    selection.anchor.path.join() !== selection.focus.path.join()
  ) {
    return;
  }

  const path = [selection.anchor.path[0]];
  const entry = editor.api.node(path);

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, number[]])
    : undefined;
}

function isSelectionAtStart(editor: PlateEditor, path: number[]): boolean {
  const selection = editor.selection;

  return !!selection && editor.api.isStart(selection.anchor, path);
}

function getDirectFieldNodeIds(editor: PlateEditor, hostPath: number[]) {
  if (!isTanaFieldHostNode(editor.children, hostPath)) return [];

  return getTanaDirectChildPaths(editor.children, hostPath).flatMap((path) => {
    const node = editor.api.node(path)?.[0] as TanaBlockElement | undefined;

    return typeof node?.tanaFieldId === 'string' && typeof node.id === 'string' ? [node.id] : [];
  });
}

function moveSplitNodeAfterFieldSubtrees(
  editor: PlateEditor,
  splitPath: number[],
  fieldNodeIds: string[]
) {
  const lastFieldPath = fieldNodeIds.reduce<number | undefined>((last, fieldNodeId) => {
    const fieldPath = getTanaNodePath(editor.children, fieldNodeId);

    if (!fieldPath) return last;

    const lastDescendantPath = getTanaNodeDescendantPaths(editor.children, fieldPath).at(-1);
    const lastPath = lastDescendantPath ?? fieldPath;

    return last === undefined ? lastPath[0] : Math.max(last, lastPath[0]);
  }, undefined);

  if (lastFieldPath === undefined || lastFieldPath < splitPath[0]) return;

  // Keep every direct Field subtree below the existing Host. Moving the new
  // sibling after those flat-indent descendants preserves Plate's split while
  // keeping the original Field owner unchanged.
  editor.tf.moveNodes({ at: splitPath, to: [lastFieldPath + 1] });
}

/**
 * Plate owns Enter and its standard split transform. This wrapper only keeps
 * the original NodeId and direct Field subtrees attached to the pre-existing
 * Host; the newly split sibling always receives fresh identity and no copied
 * Tana semantics.
 */
export const TanaNodeIdentityPlugin = createPlatePlugin({
  key: TANA_NODE_IDENTITY_PLUGIN_KEY
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const entry = getTanaNodeAtCollapsedSelection(editor);

      if (!entry || typeof entry[0].id !== 'string') return insertBreak();

      const [node, path] = entry;
      const previousId = node.id;
      const selectionAtStart = isSelectionAtStart(editor, path);
      const directFieldNodeIds = getDirectFieldNodeIds(editor, path);

      insertBreak();

      const rightPath = [path[0] + 1];
      const rightEntry = editor.api.node(rightPath);

      if (!rightEntry || !ElementApi.isElement(rightEntry[0])) return;

      if (selectionAtStart) {
        const rightId = typeof rightEntry[0].id === 'string' ? rightEntry[0].id : nanoid();

        // Slate copies node properties to the right split while retaining them
        // on the empty left block. Move the fresh ID left and the existing ID
        // right, then remove duplicate semantics from the new empty Node.
        editor.tf.setNodes({ id: rightId }, { at: path });
        TANA_SEMANTIC_KEYS.forEach((key) => editor.tf.unsetNodes(key, { at: path }));
        editor.tf.setNodes({ id: previousId }, { at: rightPath });
        return;
      }

      // At a middle/end split, Slate leaves the original Node on the left and
      // clones its properties to the right. Keep the original identity and
      // semantics on the left, then make the new right sibling ordinary.
      editor.tf.setNodes({ id: nanoid() }, { at: rightPath });
      TANA_SEMANTIC_KEYS.forEach((key) => editor.tf.unsetNodes(key, { at: rightPath }));
      moveSplitNodeAfterFieldSubtrees(editor, rightPath, directFieldNodeIds);
    }
  }
}));
