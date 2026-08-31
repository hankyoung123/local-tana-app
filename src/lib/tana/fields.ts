import { ElementApi, TextApi } from 'platejs';
import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import { buildTanaIndex } from './index';
import {
  getTanaAncestorPaths,
  getTanaParentPath,
} from './outliner';
import type {
  FieldBinding,
  FieldDefinition,
  FieldValue,
  FieldValueState,
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

function getTanaBlockAt(
  document: Value,
  path: Path
): TanaBlockElement | undefined {
  const node = path.length === 1 ? document[path[0]] : undefined;

  return node && ElementApi.isElement(node) && isTanaNodeElement(node, path)
    ? (node as TanaBlockElement)
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
  const parent = parentPath
    ? getTanaBlockAt(document, parentPath)
    : undefined;

  return parent?.tanaSupertagDefinition ? parent : undefined;
}

function isFieldWorkflowSpecialNode(node: TanaBlockElement): boolean {
  return (
    node.tanaFieldDefinition !== undefined ||
    node.tanaSupertagDefinition !== undefined ||
    node.tanaViewDefinition !== undefined
  );
}

function hasFieldWorkflowDefinitionAncestor(
  document: Value,
  path: Path
): boolean {
  return getTanaAncestorPaths(document, path).some((ancestorPath) => {
    const ancestor = getTanaBlockAt(document, ancestorPath);

    return !!ancestor && isFieldWorkflowSpecialNode(ancestor);
  });
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
  const tanaNode = getTanaBlockAt(document, path);

  if (!tanaNode) return false;

  return (
    getTanaElementText(tanaNode) === '' &&
    tanaNode.tanaFieldDefinition === undefined &&
    tanaNode.tanaSupertagDefinition === undefined &&
    tanaNode.tanaFieldValues === undefined &&
    tanaNode.tanaViewDefinition === undefined &&
    !!getDirectSupertagDefinitionParent(document, path)
  );
}

/**
 * A normal empty Node can reuse the same Plate `>` Combobox to add a Field
 * directly. Definition nodes and their subtrees stay outside this workflow.
 */
export function isAdHocFieldInputNode(
  document: Value,
  path: Path
): boolean {
  const tanaNode = getTanaBlockAt(document, path);

  return (
    !!tanaNode &&
    getTanaElementText(tanaNode) === '' &&
    !isFieldWorkflowSpecialNode(tanaNode) &&
    !hasFieldWorkflowDefinitionAncestor(document, path)
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

function hasDirectFieldValue(
  fieldValues: Readonly<Record<NodeId, FieldValueState>> | undefined,
  fieldId: NodeId
): boolean {
  return (
    !!fieldValues && Object.prototype.hasOwnProperty.call(fieldValues, fieldId)
  );
}

/** A field is defined by either a Supertag binding or a direct value key. */
export function isFieldDefined(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  const node = index.nodesById.get(nodeId);

  if (!node) return false;
  if (hasDirectFieldValue(node.fieldValues, fieldId)) return true;

  return isFieldDefinedBySupertag(index, nodeId, fieldId);
}

/** True only when an applied Supertag binds this Field for the current Node. */
export function isFieldDefinedBySupertag(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  if (!index.nodesById.has(nodeId)) return false;

  return Array.from(index.nodesBySupertag.entries()).some(
    ([supertagId, nodeIds]) =>
      nodeIds.includes(nodeId) &&
      index.nodesById
        .get(supertagId)
        ?.supertagDefinition?.fields.some(
          (binding) => binding.fieldId === fieldId
        )
  );
}

/**
 * A direct Field key is ad-hoc only when no applied Supertag also supplies the
 * same binding. Values remain stored directly for template Fields, but those
 * keys do not make the Field ad-hoc.
 */
export function isAdHocField(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  const node = index.nodesById.get(nodeId);

  return (
    !!node &&
    hasDirectFieldValue(node.fieldValues, fieldId) &&
    !isFieldDefinedBySupertag(index, nodeId, fieldId)
  );
}

/** A Field is set only when its direct document value is non-null. */
export function isFieldSet(node: TanaNode, fieldId: NodeId): boolean {
  return node.fieldValues?.[fieldId] != null;
}

/** Field candidates remain a direct read-only projection of the Plate document. */
export function getFieldDefinitionCandidates(
  document: Value
): FieldDefinitionCandidate[] {
  return getFieldDefinitionCandidatesFromIndex(buildTanaIndex(document));
}

export function getFieldDefinitionCandidatesFromIndex(
  index: TanaIndex
): FieldDefinitionCandidate[] {
  return Array.from(index.nodesById.values()).flatMap((node) =>
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
