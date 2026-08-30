import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { isTanaNodeElement, TANA_SUPERTAG_KEY } from './constants';
import { buildTanaIndex } from './index';
import type {
  FieldDefinition,
  FieldValue,
  NodeId,
  SupertagDefinition,
  TanaBlockElement,
} from './types';

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function getSupertagDefinition(
  editor: PlateEditor,
  supertagId: NodeId
): NodeEntry<TanaBlockElement> | undefined {
  const entry = getTanaNodeEntry(editor, supertagId);

  return entry?.[0].tanaSupertagDefinition ? entry : undefined;
}

function normalizeSupertagName(name: string) {
  return name.trim();
}

function getFieldDefault(field: FieldDefinition): FieldValue {
  switch (field.type) {
    case 'boolean':
      return { type: field.type, value: false };
    case 'number':
      return { type: field.type, value: 0 };
    case 'select':
      return { type: field.type, value: field.options[0] ?? '' };
    case 'date':
    case 'node-reference':
    case 'text':
      return { type: field.type, value: '' };
  }
}

function getSupertagFieldDefaults(definition: SupertagDefinition) {
  return definition.fields.reduce<Record<string, FieldValue>>(
    (defaults, field) => {
      defaults[field.id] = getFieldDefault(field);

      return defaults;
    },
    {}
  );
}

function isSelectionInNode(editor: PlateEditor, nodePath: number[]) {
  const { selection } = editor;

  if (!selection) return false;

  return [selection.anchor, selection.focus].every(
    (point) => point.path[0] === nodePath[0]
  );
}

/**
 * Creates an ordinary Plate block marked as a Supertag definition. Plate's
 * NodeId plugin assigns its ID during the insert transform.
 */
export function createSupertag(editor: PlateEditor, name: string) {
  const normalizedName = normalizeSupertagName(name);

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

/** Applies a definition relation once and initializes only missing field values. */
export function applySupertag(
  editor: PlateEditor,
  nodeId: NodeId,
  supertagId: NodeId
) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const definitionEntry = getSupertagDefinition(editor, supertagId);

  if (!nodeEntry || !definitionEntry) return false;

  const index = buildTanaIndex(editor.children);

  if (index.nodesBySupertag.get(supertagId)?.includes(nodeId)) return false;

  const [node, nodePath] = nodeEntry;
  const defaults = getSupertagFieldDefaults(
    definitionEntry[0].tanaSupertagDefinition!
  );
  const existingFieldValues = node.tanaFieldValues ?? {};
  const nextFieldValues = { ...defaults, ...existingFieldValues };

  if (Object.keys(nextFieldValues).length > 0) {
    editor.tf.setNodes({ tanaFieldValues: nextFieldValues }, { at: nodePath });
  }

  const selection = editor.selection;

  editor.tf.insertNodes(
    {
      children: [{ text: '' }],
      key: supertagId,
      type: TANA_SUPERTAG_KEY,
    },
    {
      at:
        selection && isSelectionInNode(editor, nodePath)
          ? selection
          : editor.api.end(nodePath),
    }
  );
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

/** Removes only the inline type relation, preserving node fields and definition. */
export function removeSupertag(
  editor: PlateEditor,
  nodeId: NodeId,
  supertagId: NodeId
) {
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
