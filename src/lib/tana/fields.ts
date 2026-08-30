import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from './constants';
import type {
  FieldBinding,
  FieldDefinition,
  NodeId,
  TanaBlockElement,
  TanaIndex,
  TanaNode,
} from './types';

export type ResolvedFieldBinding = {
  binding: FieldBinding;
  definition: FieldDefinition;
  field: TanaNode;
};

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

/** Resolves field bindings from document nodes without creating a schema cache. */
export function getSupertagFieldBindings(
  index: TanaIndex,
  supertagId: NodeId
): ResolvedFieldBinding[] {
  const bindings = index.nodesById.get(supertagId)?.supertagDefinition?.fields;

  if (!bindings) return [];

  return bindings.flatMap((binding) => {
    const field = index.nodesById.get(binding.fieldId);

    if (!field?.fieldDefinition) return [];

    return [{ binding, definition: field.fieldDefinition, field }];
  });
}

/** Candidate values are always derived from NodeIds already present in the index. */
export function getFieldValueCandidates(
  index: TanaIndex,
  definition: FieldDefinition
): TanaNode[] {
  const candidateIds =
    definition.type === 'options'
      ? definition.options
      : definition.type === 'from-supertag'
        ? (index.nodesBySupertag.get(definition.sourceSupertagId) ?? [])
        : [];

  return candidateIds.flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node ? [node] : [];
  });
}

/**
 * Creates a normal Plate block with Field metadata. The NodeId plugin is the
 * only identity owner and assigns the FieldId during insertion.
 */
export function createFieldDefinition(
  editor: PlateEditor,
  name: string,
  definition: FieldDefinition
): NodeId | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  const path = [editor.children.length];
  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      tanaFieldDefinition: definition,
    }),
    { at: path }
  );

  const entry = editor.api.node(path);

  return entry &&
    isTanaNodeElement(entry) &&
    typeof entry[0].id === 'string'
    ? entry[0].id
    : undefined;
}

/** Binds an existing Field Definition node to a Supertag definition once. */
export function bindFieldToSupertag(
  editor: PlateEditor,
  supertagId: NodeId,
  fieldId: NodeId
): boolean {
  const supertagEntry = getTanaNodeEntry(editor, supertagId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);

  if (
    !supertagEntry?.[0].tanaSupertagDefinition ||
    !fieldEntry?.[0].tanaFieldDefinition
  ) {
    return false;
  }

  const definition = supertagEntry[0].tanaSupertagDefinition;

  if (definition.fields.some((binding) => binding.fieldId === fieldId)) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaSupertagDefinition: {
        fields: [...definition.fields, { fieldId }],
      },
    },
    { at: supertagEntry[1] }
  );

  return true;
}
