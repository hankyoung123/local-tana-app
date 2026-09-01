import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

import { TanaFieldPlugin } from './tana-field-plugin';

export const TANA_SUPERTAG_PLUGIN_KEY = 'tanaSupertag' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function getDefinitionEntry(editor: PlateEditor, supertagId: NodeId) {
  const entry = getTanaNodeEntry(editor, supertagId);

  return entry?.[0].tanaSupertagDefinition ? entry : undefined;
}

function normalizeName(name: string) {
  return name.trim();
}

function isSelectionInNode(editor: PlateEditor, nodePath: number[]) {
  const { selection } = editor;

  return (
    !!selection &&
    [selection.anchor, selection.focus].every(
      (point) => point.path[0] === nodePath[0]
    )
  );
}

function create(editor: PlateEditor, name: string): NodeId | undefined {
  const normalizedName = normalizeName(name);

  if (!normalizedName) return;

  const existing = Array.from(buildTanaIndex(editor.children).nodesById.values()).find(
    (node) =>
      node.supertagDefinition &&
      node.text.trim().localeCompare(normalizedName, undefined, {
        sensitivity: 'accent',
        usage: 'search',
      }) === 0
  );

  if (existing) return existing.id;

  const path = [editor.children.length];
  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      tanaSupertagDefinition: { fields: [] },
    }),
    { at: path }
  );

  const definition = editor.api.node(path);

  return definition &&
    isTanaNodeElement(definition) &&
    typeof definition[0].id === 'string'
    ? definition[0].id
    : undefined;
}

function define(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry || entry[0].tanaSupertagDefinition) return false;

  editor.tf.setNodes({ tanaSupertagDefinition: { fields: [] } }, { at: entry[1] });

  return true;
}

function apply(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const definitionEntry = getDefinitionEntry(editor, supertagId);

  if (!nodeEntry || !definitionEntry) return false;

  const index = buildTanaIndex(editor.children);

  if (index.nodesBySupertag.get(supertagId)?.includes(nodeId)) return false;

  const [, nodePath] = nodeEntry;
  const bindings = definitionEntry[0].tanaSupertagDefinition!.fields;
  bindings.forEach(({ defaultValue, fieldId }) => {
    const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;

    fieldTransforms.materialize(nodeId, fieldId, defaultValue);
    if (defaultValue !== undefined) {
      fieldTransforms.applyDefault(nodeId, fieldId, defaultValue);
    }
  });

  const selectionIsInNode = isSelectionInNode(editor, nodePath);

  editor.tf.insertNodes(
    {
      children: [{ text: '' }],
      key: supertagId,
      type: TANA_SUPERTAG_KEY,
    },
    {
      at: selectionIsInNode ? editor.selection! : editor.api.end(nodePath),
    }
  );

  if (!selectionIsInNode) return true;

  editor.tf.move({ unit: 'offset' });

  const currentBlockPath = editor.api.block()?.[1];

  if (
    editor.selection &&
    currentBlockPath &&
    editor.api.isEnd(editor.selection.anchor, currentBlockPath)
  ) {
    editor.tf.insertText(' ');
  }

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);

  if (!nodeEntry) return false;

  const entries = Array.from(
    editor.api.nodes({
      at: nodeEntry[1],
      match: (node) =>
        ElementApi.isElement(node) &&
        node.type === TANA_SUPERTAG_KEY &&
        node.key === supertagId,
    })
  );

  entries.reverse().forEach(([, path]) => editor.tf.removeNodes({ at: path }));

  return entries.length > 0;
}

/** Owns all document mutations for the existing Plate `#` Combobox workflow. */
export const TanaSupertagPlugin = createPlatePlugin({
  key: TANA_SUPERTAG_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  supertag: {
    apply: (nodeId: NodeId, supertagId: NodeId) =>
      apply(editor, nodeId, supertagId),
    create: (name: string) => create(editor, name),
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId, supertagId: NodeId) =>
      remove(editor, nodeId, supertagId),
  },
}));
