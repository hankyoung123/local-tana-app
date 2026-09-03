import { ElementApi, nanoid } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import { getTanaDirectChildPaths, getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
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

function getFocusedHostBodyInsertionPath(editor: PlateEditor, hostPath: number[]) {
  const afterFieldSubtrees = getTanaDirectChildPaths(editor.children, hostPath).flatMap(
    (path) => {
      const node = editor.api.node(path)?.[0] as TanaBlockElement | undefined;

      if (typeof node?.tanaFieldId !== 'string') return [];

      const lastDescendant = getTanaNodeDescendantPaths(editor.children, path).at(-1);

      return [(lastDescendant ?? path)[0] + 1];
    }
  );

  return [Math.max(hostPath[0] + 1, ...afterFieldSubtrees)];
}

function insertFocusedHostBodyChild(
  editor: PlateEditor,
  host: TanaBlockElement,
  hostPath: number[]
) {
  const indent = typeof host.indent === 'number' ? host.indent + 1 : 1;
  const childPath = getFocusedHostBodyInsertionPath(editor, hostPath);

  editor.tf.insertNodes(
    editor.api.create.block({ children: [{ text: '' }], indent }),
    { at: childPath }
  );

  const point = editor.api.start(childPath);

  if (!point) return;

  editor.tf.navigation.navigate({
    flash: false,
    focus: true,
    scroll: true,
    select: point,
    target: { path: childPath, type: 'node' },
  });
}

/**
 * Plate owns ordinary splits. A focused Field Host creates a direct body child
 * after Field subtrees, keeping page body editing inside the current Zoom
 * range and leaving Field ownership untouched.
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

      if (focusedNodeId === node.id && isTanaFieldHostNode(editor.children, path)) {
        return insertFocusedHostBodyChild(editor, node, path);
      }

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
