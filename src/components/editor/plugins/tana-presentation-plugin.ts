import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

export const TANA_PRESENTATION_PLUGIN_KEY = 'tanaPresentation' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

/**
 * Persists only a Node's field visibility preference. It deliberately never
 * touches Field Values, bindings, queries, or any other Tana semantics.
 */
function setFieldVisible(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldKey: string,
  visible: boolean
) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const normalizedFieldKey = fieldKey.trim();

  if (!entry || !normalizedFieldKey) return false;

  const hidden = new Set(entry[0].tanaPresentation?.hiddenFieldKeys ?? []);

  if (visible) hidden.delete(normalizedFieldKey);
  else hidden.add(normalizedFieldKey);

  if (hidden.size === 0) {
    if (!entry[0].tanaPresentation) return false;

    editor.tf.unsetNodes('tanaPresentation', { at: entry[1] });
    return true;
  }

  const nextHiddenFieldKeys = [...hidden];
  const currentHiddenFieldKeys = entry[0].tanaPresentation?.hiddenFieldKeys ?? [];

  if (
    currentHiddenFieldKeys.length === nextHiddenFieldKeys.length &&
    currentHiddenFieldKeys.every((key, index) => key === nextHiddenFieldKeys[index])
  ) {
    return false;
  }

  editor.tf.setNodes(
    { tanaPresentation: { hiddenFieldKeys: nextHiddenFieldKeys } },
    { at: entry[1] }
  );

  return true;
}

/** Owns the minimal persisted presentation preference for Tana field rows. */
export const TanaPresentationPlugin = createPlatePlugin({
  key: TANA_PRESENTATION_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  presentation: {
    setFieldVisible: (nodeId: NodeId, fieldKey: string, visible: boolean) =>
      setFieldVisible(editor, nodeId, fieldKey, visible),
  },
}));
