import { ElementApi, TextApi } from 'platejs';
import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import { getNodeSupertagIds } from './index';
import {
  getTanaAncestorPaths,
  getTanaParentPath,
} from './outliner';
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

export const TANA_SYSTEM_FIELD_KEYS = {
  backlinks: '$system:backlinks',
  children: '$system:children',
  parent: '$system:parent',
  supertags: '$system:supertags',
  title: '$system:title',
} as const;

export type TanaSystemFieldKey =
  (typeof TANA_SYSTEM_FIELD_KEYS)[keyof typeof TANA_SYSTEM_FIELD_KEYS];

/**
 * A read-only UI description of a Node field. It never stores a second copy
 * of Field Values or hierarchy; all values and relationships remain derived
 * from the current TanaIndex.
 */
export type TanaFieldDescriptor = {
  definition?: FieldDefinition;
  fieldId?: NodeId;
  /** The real Field occurrence Node that presentation can show or hide. */
  fieldNodeId?: NodeId;
  key: NodeId | TanaSystemFieldKey;
  label: string;
  source: 'custom' | 'supertag' | 'system';
  supertagIds?: readonly NodeId[];
  systemValue?: string;
  visible: boolean;
};

/** Field values are never coerced across Field Definition type changes. */
export function isFieldValueCompatible(
  definition: FieldDefinition,
  value: FieldValue
): boolean {
  return definition.type === value.type;
}

/** Validates both a FieldValue's type and its reference-like candidate. */
export function isFieldValueValid(
  index: TanaIndex,
  definition: FieldDefinition,
  value: FieldValue
): boolean {
  if (!isFieldValueCompatible(definition, value)) return false;

  if (definition.type === 'options' && value.type === 'options') {
    return (
      definition.options.includes(value.value) && index.nodesById.has(value.value)
    );
  }

  if (definition.type === 'from-supertag' && value.type === 'from-supertag') {
    return (
      definition.sourceSupertagId !== null &&
      (index.nodesBySupertag.get(definition.sourceSupertagId)?.includes(value.value) ??
        false)
    );
  }

  return true;
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
    node.tanaFieldId !== undefined ||
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
    tanaNode.tanaFieldId === undefined &&
    tanaNode.tanaSupertagDefinition === undefined &&
    tanaNode.tanaFieldValueType === undefined &&
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
    !hasFieldWorkflowDefinitionAncestor(document, path) &&
    !!getTanaParentPath(document, path)
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

/** A Field is defined only when its occurrence Node exists under this Node. */
export function isFieldDefined(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  return (
    index.nodesById.has(nodeId) &&
    (index.fieldNodesByParent.get(nodeId)?.some(
      (fieldNode) => fieldNode.fieldId === fieldId
    ) ?? false)
  );
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
 * A Field occurrence is ad-hoc only when no applied Supertag supplies the
 * same Field binding. The occurrence itself remains a normal Plate Node.
 */
export function isAdHocField(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  return (
    isFieldDefined(index, nodeId, fieldId) &&
    !isFieldDefinedBySupertag(index, nodeId, fieldId)
  );
}

/** A Field is set only when its value is derivable from its value child Node. */
export function isFieldSet(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  return index.fieldValues.get(nodeId)?.has(fieldId) ?? false;
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
  index: TanaIndex,
  name: string
): FieldDefinitionCandidate | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  return getFieldDefinitionCandidatesFromIndex(index).find((candidate) =>
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
      : definition.type === 'from-supertag' && definition.sourceSupertagId
        ? (index.nodesBySupertag.get(definition.sourceSupertagId) ?? [])
        : [];

  return candidateIds.flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node ? [node] : [];
  });
}

function getNodeIndent(node: TanaNode): number {
  return typeof node.node.indent === 'number' ? node.node.indent : 0;
}

function getParentNode(
  nodes: readonly TanaNode[],
  nodeIndex: number
): TanaNode | undefined {
  const nodeIndent = getNodeIndent(nodes[nodeIndex]);

  for (let index = nodeIndex - 1; index >= 0; index -= 1) {
    if (getNodeIndent(nodes[index]) < nodeIndent) return nodes[index];
  }
}

function getDirectChildren(
  nodes: readonly TanaNode[],
  nodeIndex: number
): TanaNode[] {
  const node = nodes[nodeIndex];
  const nodeIndent = getNodeIndent(node);
  const children: TanaNode[] = [];

  for (let index = nodeIndex + 1; index < nodes.length; index += 1) {
    if (getNodeIndent(nodes[index]) <= nodeIndent) break;

    if (getParentNode(nodes, index)?.id === node.id) children.push(nodes[index]);
  }

  return children;
}

function formatNodeNames(nodes: readonly TanaNode[]): string {
  if (nodes.length === 0) return '无';

  return nodes.map((node) => node.text || '未命名节点').join('、');
}

/**
 * Derives system, Supertag, and direct Field descriptors for one Node. The
 * output is presentation data only; field ownership and values still live in
 * the Plate document and are edited exclusively through TanaFieldPlugin.
 */
export function getNodeFieldDescriptors(
  index: TanaIndex,
  nodeId: NodeId
): TanaFieldDescriptor[] {
  const node = index.nodesById.get(nodeId);

  if (!node) return [];

  const hiddenFieldNodeIds = new Set(node.presentation?.hiddenFieldNodeIds ?? []);
  const withVisibility = <T extends Omit<TanaFieldDescriptor, 'visible'>>(
    descriptor: T
  ): TanaFieldDescriptor => ({
    ...descriptor,
    visible:
      descriptor.fieldNodeId === undefined ||
      !hiddenFieldNodeIds.has(descriptor.fieldNodeId),
  });
  const nodes = Array.from(index.nodesById.values());
  const nodeIndex = nodes.findIndex((candidate) => candidate.id === nodeId);
  const parent = nodeIndex >= 0 ? getParentNode(nodes, nodeIndex) : undefined;
  const children = nodeIndex >= 0 ? getDirectChildren(nodes, nodeIndex) : [];
  const supertagIds = getNodeSupertagIds(index, nodeId);
  const supertagLabels = supertagIds
    .map((supertagId) => index.nodesById.get(supertagId))
    .filter((supertag): supertag is TanaNode => !!supertag)
    .map((supertag) => `#${supertag.text || '未命名超级标签'}`)
    .join('、');
  const system: TanaFieldDescriptor[] = [
    withVisibility({
      key: TANA_SYSTEM_FIELD_KEYS.title,
      label: '标题',
      source: 'system',
      systemValue: node.text || '未命名节点',
    }),
    withVisibility({
      key: TANA_SYSTEM_FIELD_KEYS.supertags,
      label: '超级标签',
      source: 'system',
      systemValue: supertagLabels || '未标记',
    }),
    withVisibility({
      key: TANA_SYSTEM_FIELD_KEYS.parent,
      label: '父节点',
      source: 'system',
      systemValue: parent?.text || '工作区',
    }),
    withVisibility({
      key: TANA_SYSTEM_FIELD_KEYS.children,
      label: '子节点',
      source: 'system',
      systemValue: formatNodeNames(children),
    }),
    withVisibility({
      key: TANA_SYSTEM_FIELD_KEYS.backlinks,
      label: '反向引用',
      source: 'system',
      systemValue: `${index.backlinks.get(nodeId)?.length ?? 0} 个`,
    }),
  ];
  const fieldNodes = index.fieldNodesByParent.get(nodeId) ?? [];

  const semanticFields = fieldNodes.flatMap((fieldNode) => {
    const field = index.nodesById.get(fieldNode.fieldId);

    if (!field?.fieldDefinition) return [];

    const matchingSupertagIds = supertagIds.filter((supertagId) =>
      index.nodesById
        .get(supertagId)
        ?.supertagDefinition?.fields.some(
          (binding) => binding.fieldId === fieldNode.fieldId
        )
    );

    return [
      withVisibility({
        definition: field.fieldDefinition,
        fieldId: field.id,
        fieldNodeId: fieldNode.id,
        key: fieldNode.id,
        label: field.text || '未命名字段',
        source: matchingSupertagIds.length > 0 ? 'supertag' : 'custom',
        ...(matchingSupertagIds.length > 0
          ? { supertagIds: matchingSupertagIds }
          : {}),
      }),
    ];
  });

  return [...system, ...semanticFields];
}
