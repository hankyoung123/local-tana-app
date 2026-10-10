import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { hasNodeSemantic } from '@/lib/tana/node-semantic';
import type { NodeId, TanaBlockElement, TanaViewDefinition, TanaViewState } from '@/lib/tana/types';
import { setTanaViewType, writeTanaViewState } from '@/lib/tana/view-state';

export const TANA_VIEW_PLUGIN_KEY = 'tanaView' as const;

type TanaViewPresentationPatch = Partial<TanaViewState> & {
  toolbarVisible?: boolean;
};

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
  patch: TanaViewPresentationPatch
) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry?.[0].tanaViewDefinition) {
    return false;
  }

  const current = entry[0].tanaViewDefinition;
  const { toolbarVisible, ...statePatch } = patch;
  const nextDefinition = writeTanaViewState(current, current.type, statePatch);
  const withToolbar = toolbarVisible === undefined
    ? nextDefinition
    : { ...nextDefinition, toolbarVisible };

  editor.tf.setNodes({ tanaViewDefinition: withToolbar }, { at: entry[1] });

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

  editor.tf.setNodes({ tanaViewDefinition: setTanaViewType(entry[0].tanaViewDefinition, type) }, { at: entry[1] });
  return true;
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
