import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { hasNodeSemantic } from '@/lib/tana/node-semantic';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

export const TANA_VIEW_PLUGIN_KEY = 'tanaView' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function define(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry ||
    hasNodeSemantic(entry[0], 'view', {
      document: editor.children,
      path: entry[1],
    })
  ) {
    return false;
  }

  editor.tf.setNodes({ tanaViewDefinition: { type: 'outline' } }, { at: entry[1] });

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry ||
    !hasNodeSemantic(entry[0], 'view', {
      document: editor.children,
      path: entry[1],
    })
  ) {
    return false;
  }

  editor.tf.unsetNodes('tanaViewDefinition', { at: entry[1] });

  return true;
}

/** Owns only the presentation metadata of a View Node. */
export const TanaViewPlugin = createPlatePlugin({
  key: TANA_VIEW_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  view: {
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId) => remove(editor, nodeId),
  },
}));
