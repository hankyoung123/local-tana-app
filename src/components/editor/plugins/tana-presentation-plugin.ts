import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  getTanaNodeDescendantPaths,
  getTanaParentPath,
} from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';
import { TanaZoomPlugin } from './tana-zoom-plugin';

export const TANA_PRESENTATION_PLUGIN_KEY = 'tanaPresentation' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function moveInteractionToFieldOwner(
  editor: PlateEditor,
  ownerEntry: NodeEntry<TanaBlockElement>,
  fieldEntry: NodeEntry<TanaBlockElement>
) {
  const hiddenPathIndexes = new Set(
    [fieldEntry[1], ...getTanaNodeDescendantPaths(editor.children, fieldEntry[1])].map(
      (path) => path[0]
    )
  );
  const selectionPaths = [editor.selection?.anchor.path, editor.selection?.focus.path];

  if (selectionPaths.some((path) => path && hiddenPathIndexes.has(path[0]))) {
    const point = editor.api.start(ownerEntry[1]);

    if (point) {
      editor.tf.navigation.navigate({
        flash: false,
        focus: true,
        scroll: true,
        select: point,
        target: { path: ownerEntry[1], type: 'node' },
      });
    }
  }

  const focusedNodeId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
  const focusedEntry =
    typeof focusedNodeId === 'string' ? getTanaNodeEntry(editor, focusedNodeId) : undefined;

  if (
    focusedEntry &&
    hiddenPathIndexes.has(focusedEntry[1][0]) &&
    typeof ownerEntry[0].id === 'string'
  ) {
    editor.getTransforms(TanaZoomPlugin).zoom.to(ownerEntry[0].id);
  }

  editor.getApi(TanaZoomPlugin).zoom.pruneBlockSelection();
}

/**
 * Persists only a Node's field visibility preference. It deliberately never
 * touches Field Values, templates, queries, or any other Tana semantics.
 */
function setFieldVisible(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldNodeId: NodeId,
  visible: boolean
) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldNodeId);
  const normalizedFieldNodeId = fieldNodeId.trim();

  if (
    !entry ||
    !fieldEntry?.[0].tanaFieldId ||
    !normalizedFieldNodeId ||
    getTanaParentPath(editor.children, fieldEntry[1])?.[0] !== entry[1][0]
  ) {
    return false;
  }

  const hidden = new Set(entry[0].tanaPresentation?.hiddenFieldNodeIds ?? []);

  if (visible) hidden.delete(normalizedFieldNodeId);
  else hidden.add(normalizedFieldNodeId);

  if (hidden.size === 0) {
    if (!entry[0].tanaPresentation) return false;

    editor.tf.unsetNodes('tanaPresentation', { at: entry[1] });
    return true;
  }

  const nextHiddenFieldNodeIds = [...hidden];
  const currentHiddenFieldNodeIds =
    entry[0].tanaPresentation?.hiddenFieldNodeIds ?? [];

  if (
    currentHiddenFieldNodeIds.length === nextHiddenFieldNodeIds.length &&
    currentHiddenFieldNodeIds.every(
      (key, index) => key === nextHiddenFieldNodeIds[index]
    )
  ) {
    return false;
  }

  editor.tf.setNodes(
    { tanaPresentation: { hiddenFieldNodeIds: nextHiddenFieldNodeIds } },
    { at: entry[1] }
  );

  if (!visible) {
    moveInteractionToFieldOwner(editor, entry, fieldEntry);
  }

  return true;
}

/** Owns the minimal persisted presentation preference for Tana field rows. */
export const TanaPresentationPlugin = createPlatePlugin({
  key: TANA_PRESENTATION_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  presentation: {
    setFieldVisible: (nodeId: NodeId, fieldNodeId: NodeId, visible: boolean) =>
      setFieldVisible(editor, nodeId, fieldNodeId, visible),
  },
}));
