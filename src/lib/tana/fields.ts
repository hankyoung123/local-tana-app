import { ElementApi, TextApi } from 'platejs';
import type { NodeEntry, Path, TElement, Value } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from './constants';
import { buildTanaIndex } from './index';
import {
  getTanaNodeDescendantPaths,
  getTanaNodePath,
  getTanaParentPath,
} from './outliner';
import { focusTanaNode } from './zoom';
import type {
  FieldBinding,
  FieldDefinition,
  FieldValue,
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

export type FieldDefinitionCandidate = Pick<
  TanaNode,
  'fieldDefinition' | 'id' | 'text'
> & {
  fieldDefinition: FieldDefinition;
};

/** Field values are never coerced across Field Definition type changes. */
export function isFieldValueCompatible(
  definition: FieldDefinition,
  value: FieldValue
): boolean {
  return definition.type === value.type;
}

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function getTanaElementText(element: TElement): string {
  return element.children
    .map((child) => {
      if (TextApi.isText(child)) return child.text;

      return ElementApi.isElement(child) ? getTanaElementText(child) : '';
    })
    .join('');
}

function getDirectSupertagDefinitionParent(
  document: Value,
  path: Path
): TanaBlockElement | undefined {
  const parentPath = getTanaParentPath(document, path);
  const parent = parentPath ? document[parentPath[0]] : undefined;

  if (
    !parent ||
    !parentPath ||
    !ElementApi.isElement(parent) ||
    !isTanaNodeElement(parent, parentPath) ||
    !(parent as TanaBlockElement).tanaSupertagDefinition
  ) {
    return;
  }

  return parent as TanaBlockElement;
}

/**
 * Identifies the one empty, direct Supertag child that Plate may turn into a
 * transient `>` Field Combobox input. This derives solely from the document;
 * no temporary flag or parallel workflow state is introduced.
 */
export function isSupertagFieldInputNode(
  document: Value,
  path: Path
): boolean {
  const node = path.length === 1 ? document[path[0]] : undefined;

  if (!node || !ElementApi.isElement(node) || !isTanaNodeElement(node, path)) {
    return false;
  }

  const tanaNode = node as TanaBlockElement;

  return (
    getTanaElementText(tanaNode) === '' &&
    tanaNode.tanaFieldDefinition === undefined &&
    tanaNode.tanaSupertagDefinition === undefined &&
    tanaNode.tanaFieldValues === undefined &&
    tanaNode.tanaViewDefinition === undefined &&
    !!getDirectSupertagDefinitionParent(document, path)
  );
}

/** Returns the direct Supertag parent only for a verified transient input node. */
export function getSupertagFieldInputParentId(
  document: Value,
  path: Path
): NodeId | undefined {
  if (!isSupertagFieldInputNode(document, path)) return;

  const parent = getDirectSupertagDefinitionParent(document, path);

  return typeof parent?.id === 'string' ? parent.id : undefined;
}

/** Field candidates remain a direct read-only projection of the Plate document. */
export function getFieldDefinitionCandidates(
  document: Value
): FieldDefinitionCandidate[] {
  const { nodesById } = buildTanaIndex(document);

  return Array.from(nodesById.values()).flatMap((node) =>
    node.fieldDefinition ? [{ ...node, fieldDefinition: node.fieldDefinition }] : []
  );
}

function isFieldDefinitionNameExact(
  candidate: FieldDefinitionCandidate,
  normalizedName: string
): boolean {
  return (
    candidate.text.trim().localeCompare(normalizedName, undefined, {
      sensitivity: 'accent',
      usage: 'search',
    }) === 0
  );
}

/**
 * Keeps Plate's fuzzy filtering intact while placing an exact candidate first
 * in the already-derived candidate list.
 */
export function prioritizeFieldDefinitionCandidates(
  candidates: readonly FieldDefinitionCandidate[],
  name: string
): FieldDefinitionCandidate[] {
  const normalizedName = name.trim();

  if (!normalizedName) return [...candidates];

  const exact: FieldDefinitionCandidate[] = [];
  const fuzzy: FieldDefinitionCandidate[] = [];

  candidates.forEach((candidate) => {
    (isFieldDefinitionNameExact(candidate, normalizedName) ? exact : fuzzy).push(
      candidate
    );
  });

  return [...exact, ...fuzzy];
}

export function hasFieldDefinitionExactMatch(
  candidates: readonly FieldDefinitionCandidate[],
  name: string
): boolean {
  const normalizedName = name.trim();

  return (
    normalizedName.length > 0 &&
    candidates.some((candidate) =>
      isFieldDefinitionNameExact(candidate, normalizedName)
    )
  );
}

export function findFieldDefinitionExactMatch(
  document: Value,
  name: string
): FieldDefinitionCandidate | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  return getFieldDefinitionCandidates(document).find((candidate) =>
    isFieldDefinitionNameExact(candidate, normalizedName)
  );
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
  definition: FieldDefinition,
  parentNodeId?: NodeId
): NodeId | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  const parentEntry = parentNodeId
    ? getTanaNodeEntry(editor, parentNodeId)
    : undefined;

  if (parentNodeId && !parentEntry) return;

  const parentPath = parentEntry?.[1];
  const parentIndent = parentEntry?.[0].indent;
  const descendants = parentPath
    ? getTanaNodeDescendantPaths(editor.children, parentPath)
    : [];
  const path = parentPath
    ? [(descendants.at(-1)?.[0] ?? parentPath[0]) + 1]
    : [editor.children.length];
  const indent =
    parentPath
      ? (typeof parentIndent === 'number' ? parentIndent : 0) + 1
      : undefined;

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      ...(indent === undefined ? {} : { indent }),
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

type FieldTemplateChoice =
  | { fieldId: NodeId }
  | { name: string; type: 'create' };

/**
 * Completes one transient `>` picker interaction using existing document
 * transforms: bind or create a Field Definition, remove the temporary node,
 * then return focus to the Supertag Definition.
 */
export function completeSupertagFieldTemplateInput(
  editor: PlateEditor,
  temporaryNodeId: NodeId,
  supertagId: NodeId,
  choice: FieldTemplateChoice
): NodeId | undefined {
  const temporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

  if (
    !temporaryPath ||
    !isSupertagFieldInputNode(editor.children, temporaryPath) ||
    getSupertagFieldInputParentId(editor.children, temporaryPath) !== supertagId
  ) {
    return;
  }

  const fieldId =
    'fieldId' in choice
      ? choice.fieldId
      : createFieldDefinition(editor, choice.name, { type: 'plain' }, supertagId);

  if (!fieldId) return;

  const supertagEntry = getTanaNodeEntry(editor, supertagId);
  const alreadyBound = supertagEntry?.[0].tanaSupertagDefinition?.fields.some(
    (binding) => binding.fieldId === fieldId
  );

  if (!alreadyBound && !bindFieldToSupertag(editor, supertagId, fieldId)) {
    return;
  }

  const currentTemporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

  if (!currentTemporaryPath) return;

  editor.tf.removeNodes({ at: currentTemporaryPath });
  focusTanaNode(editor, supertagId);

  return fieldId;
}
