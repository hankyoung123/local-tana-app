import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { hasNodeSemantic } from '@/lib/tana/node-semantic';
import type { NodeId, TanaBlockElement, TanaViewDefinition } from '@/lib/tana/types';

export const TANA_VIEW_PLUGIN_KEY = 'tanaView' as const;

type TanaViewPresentationPatch = Partial<
  Pick<
    TanaViewDefinition,
    'calendarDateFieldId' | 'groupFieldId' | 'sort' | 'visibleFieldIds'
  >
>;

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

function writeDefinition(
  editor: PlateEditor,
  nodeId: NodeId,
  patch: Partial<TanaViewDefinition>
) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry?.[0].tanaViewDefinition) {
    return false;
  }

  const nextDefinition = { ...entry[0].tanaViewDefinition, ...patch };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) Reflect.deleteProperty(nextDefinition, key);
  }

  editor.tf.setNodes({ tanaViewDefinition: nextDefinition }, { at: entry[1] });

  return true;
}

function setType(
  editor: PlateEditor,
  nodeId: NodeId,
  type: TanaViewDefinition['type']
) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry?.[0].tanaViewDefinition || entry[0].tanaViewDefinition.type === type) {
    return false;
  }

  return writeDefinition(editor, nodeId, { type });
}

function update(
  editor: PlateEditor,
  nodeId: NodeId,
  patch: TanaViewPresentationPatch
) {
  return writeDefinition(editor, nodeId, patch);
}

/** Owns only the presentation metadata of a View Node. */
export const TanaViewPlugin = createPlatePlugin({
  key: TANA_VIEW_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  view: {
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId) => remove(editor, nodeId),
    setType: (nodeId: NodeId, type: TanaViewDefinition['type']) =>
      setType(editor, nodeId, type),
    update: (nodeId: NodeId, patch: TanaViewPresentationPatch) =>
      update(editor, nodeId, patch),
  },
}));
