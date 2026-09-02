import { ElementApi, nanoid } from 'platejs';
import {
  createPlatePlugin,
  type PlateEditor,
} from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import type { TanaBlockElement } from '@/lib/tana/types';

export const TANA_NODE_IDENTITY_PLUGIN_KEY = 'tanaNodeIdentity' as const;

const TANA_SEMANTIC_KEYS = [
  'tanaFieldDefinition',
  'tanaFieldId',
  'tanaFieldValueType',
  'tanaPresentation',
  'tanaSupertagDefinition',
  'tanaViewDefinition',
] as const;

function getTanaNodeAtSelectionStart(editor: PlateEditor) {
  const selection = editor.selection;

  if (
    !selection ||
    selection.anchor.offset !== selection.focus.offset ||
    selection.anchor.path.join() !== selection.focus.path.join()
  ) {
    return;
  }

  const path = [selection.anchor.path[0]];
  const start = editor.api.start(path);

  if (
    !start ||
    start.offset !== selection.anchor.offset ||
    start.path.join() !== selection.anchor.path.join()
  ) {
    return;
  }

  const entry = editor.api.node(path);

  return entry &&
    ElementApi.isElement(entry[0]) &&
    isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, number[]])
    : undefined;
}

/**
 * Plate owns Enter and its standard split transform. This wrapper only keeps
 * an existing Tana Node's identity with its content when Enter is pressed at
 * the beginning of that Node. The new empty left block gets the fresh ID.
 */
export const TanaNodeIdentityPlugin = createPlatePlugin({
  key: TANA_NODE_IDENTITY_PLUGIN_KEY,
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const entry = getTanaNodeAtSelectionStart(editor);

      if (!entry || typeof entry[0].id !== 'string') return insertBreak();

      const [node, path] = entry;
      const previousId = node.id;

      insertBreak();

      const rightPath = [path[0] + 1];
      const rightEntry = editor.api.node(rightPath);

      if (!rightEntry || !ElementApi.isElement(rightEntry[0])) return;

      const rightId =
        typeof rightEntry[0].id === 'string' ? rightEntry[0].id : nanoid();

      // Slate copies node properties to the right split while retaining them
      // on the empty left block. Move the fresh ID left and the existing ID
      // right, then remove duplicate semantics from the new empty Node.
      editor.tf.setNodes({ id: rightId }, { at: path });
      TANA_SEMANTIC_KEYS.forEach((key) => editor.tf.unsetNodes(key, { at: path }));
      editor.tf.setNodes({ id: previousId }, { at: rightPath });
    },
  },
}));
