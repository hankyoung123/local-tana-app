import { ElementApi, nanoid } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import type { TanaBlockElement } from '@/lib/tana/types';
import { TanaZoomPlugin } from './tana-zoom-plugin';

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

/**
 * Plate owns ordinary Node splitting. The focused Zoom Node is page Header
 * presentation, so Enter there deliberately leaves the document unchanged.
 */
export const TanaNodeIdentityPlugin = createPlatePlugin({
  key: TANA_NODE_IDENTITY_PLUGIN_KEY
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const entry = getTanaNodeAtCollapsedSelection(editor);

      if (!entry || typeof entry[0].id !== 'string') return insertBreak();

      const [node, path] = entry;
      const focusedNodeId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');

      if (focusedNodeId === node.id) return;

      const previousId = node.id;
      const selectionAtStart = isSelectionAtStart(editor, path);

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
    }
  }
}));
