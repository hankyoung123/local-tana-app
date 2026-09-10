import { ElementApi, TextApi } from 'platejs';
import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import { getFieldValueValidationIssues } from './field-value';
import { resolveFieldValueCandidates } from './field-candidates';
import {
  getNodeSupertagIds,
  getSupertagInheritance,
  isTanaNodeActive,
  isTanaNodeInTrash,
} from './index';
import { hasNodeSemantic } from './node-semantic';
import { runTanaQuery } from './query';
import {
  getTanaAncestorPaths,
  getTanaDirectChildPaths,
  isTanaFieldNodeAtTemplateDefault,
  getTanaParentPath,
} from './outliner';
import type {
  FieldDefinition,
  FieldVisibilityPolicy,
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaIndex,
  TanaNode,
} from './types';

/** A Supertag template is its real direct child Field occurrence Node. */
export type ResolvedSupertagTemplateField = {
  definition: FieldDefinition;
  fieldId: NodeId;
  field: TanaNode;
  optional: boolean;
  /** Pinned is a template presentation preference, derived by instances. */
  pinned: boolean;
  /** Explicit template defaults live on real Value child Nodes in document order. */
  values: readonly FieldValue[];
};

export type FieldDefinitionCandidate = Pick<
  TanaNode,
  'fieldDefinition' | 'id' | 'text'
> & {
  fieldDefinition: FieldDefinition;
  /** Derived hierarchy context for stable `>` discovery ordering. */
  schemaOwned: boolean;
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
  /** The relation is retained, but its definition is unavailable. */
  brokenFieldDefinition?: boolean;
  /** A broken definition can still be restored when its original Node is in Trash. */
  fieldDefinitionInTrash?: boolean;
  definition?: FieldDefinition;
  fieldId?: NodeId;
  /** The real Field occurrence Node that presentation can show or hide. */
  fieldNodeId?: NodeId;
  hasStoredValue?: boolean;
  isDefaultValue?: boolean;
  key: NodeId | TanaSystemFieldKey;
  label: string;
  pinned?: boolean;
  source: 'custom' | 'supertag' | 'system';
  supertagIds?: readonly NodeId[];
  systemValue?: string;
  visible: boolean;
  visibilityPolicy?: FieldVisibilityPolicy;
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
  fieldId: NodeId,
  value: FieldValue
): boolean {
  return (
    isTanaNodeActive(index, fieldId) &&
    index.nodesById.get(fieldId)?.fieldDefinition !== undefined &&
    getFieldValueValidation(index, fieldId, value).length === 0
  );
}

/**
 * Read-only validation for a decoded value. It is intentionally separate
 * from writer permission: callers retain invalid canonical input and expose
 * the returned warnings in their own presentation.
 */
export function getFieldValueValidation(
  index: TanaIndex,
  fieldId: NodeId,
  value: FieldValue
) {
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;

  if (!definition || !isTanaNodeActive(index, fieldId)) return [];

  const candidateIds =
    definition.type === 'options' || definition.type === 'from-supertag'
      ? new Set(getFieldValueCandidates(index, fieldId).map((candidate) => candidate.id))
      : undefined;

  return getFieldValueValidationIssues(definition, value, candidateIds);
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

/**
 * A Field occurrence may be attached only to an ordinary Tana Node or a
 * Supertag Definition Node. Definitions, Field rows, and value rows are never
 * valid Field hosts.
 */
export function isTanaFieldHostNode(document: Value, path: Path): boolean {
  const node = getTanaBlockAt(document, path);

  return (
    !!node &&
    node.tanaFieldDefinition === undefined &&
    node.tanaFieldId === undefined &&
    node.tanaFieldValueType === undefined &&
    node.tanaReferenceTargetId === undefined
  );
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
    node.tanaReferenceTargetId !== undefined ||
    node.tanaSearchDefinition !== undefined ||
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
    tanaNode.tanaReferenceTargetId === undefined &&
    tanaNode.tanaSearchDefinition === undefined &&
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

/** True only when an applied Supertag owns a matching template Field Node. */
export function isFieldDefinedBySupertag(
  index: TanaIndex,
  nodeId: NodeId,
  fieldId: NodeId
): boolean {
  if (!index.nodesById.has(nodeId)) return false;

  return Array.from(index.nodesBySupertag.entries()).some(
    ([supertagId, nodeIds]) =>
      nodeIds.includes(nodeId) &&
      getSupertagTemplateFields(index, supertagId).some(
        (template) => template.fieldId === fieldId
      )
  );
}

/**
 * A Field occurrence is ad-hoc only when no applied Supertag supplies the
 * same template Field. The occurrence itself remains a normal Plate Node.
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
  return (
    index.fieldNodesByParent
      .get(nodeId)
      ?.some((fieldNode) => fieldNode.fieldId === fieldId && fieldNode.values.length > 0) ??
    false
  );
}

export function getFieldDefinitionCandidatesFromIndex(
  index: TanaIndex
): FieldDefinitionCandidate[] {
  const schemaId = index.systemNodeIds.get('schema');
  const isSchemaOwned = (nodeId: NodeId) => {
    const visited = new Set<NodeId>();
    let current = index.parentNodeIds.get(nodeId);

    while (current && !visited.has(current)) {
      if (current === schemaId) return true;
      visited.add(current);
      current = index.parentNodeIds.get(current);
    }

    return false;
  };

  return Array.from(index.nodesById.values()).flatMap((node) =>
    isTanaNodeActive(index, node.id) &&
    node.semanticTypes.includes('field-definition') &&
    node.fieldDefinition
      ? [{
          ...node,
          fieldDefinition: node.fieldDefinition,
          schemaOwned: isSchemaOwned(node.id),
        }]
      : []
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

  return [
    ...exact.filter((candidate) => candidate.schemaOwned),
    ...exact.filter((candidate) => !candidate.schemaOwned),
    ...fuzzy,
  ];
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

  return prioritizeFieldDefinitionCandidates(
    getFieldDefinitionCandidatesFromIndex(index),
    normalizedName
  ).find((candidate) => isFieldDefinitionNameExact(candidate, normalizedName));
}

/**
 * Resolves a Supertag's template Fields from ordered direct children. A template
 * can either be an external Field occurrence or a local Field Definition Node.
 */
function getDirectSupertagTemplateFields(
  index: TanaIndex,
  supertagId: NodeId
): ResolvedSupertagTemplateField[] {
  const supertag = index.nodesById.get(supertagId);

  if (!supertag || !supertag.semanticTypes.includes('supertag-definition')) {
    return [];
  }

  return (index.childrenByParent.get(supertagId) ?? []).flatMap((childId) => {
    const child = index.nodesById.get(childId);

    if (!child) return [];

    if (child.semanticTypes.includes('field-definition') && child.fieldDefinition) {
      return [{
        definition: child.fieldDefinition,
        field: child,
        fieldId: child.id,
        optional: (child.node as TanaBlockElement).tanaFieldOptional === true,
        pinned: (child.node as TanaBlockElement).tanaFieldPinned === true,
        values: [],
      }];
    }

    const template = index.fieldNodesById.get(child.id);
    const field = template ? index.nodesById.get(template.fieldId) : undefined;

    if (
      !template ||
      !field?.fieldDefinition ||
      !field.semanticTypes.includes('field-definition')
    ) {
      return [];
    }

    return [{
      definition: field.fieldDefinition,
      field,
      fieldId: template.fieldId,
      optional: (child.node as TanaBlockElement).tanaFieldOptional === true,
      pinned: (child.node as TanaBlockElement).tanaFieldPinned === true,
      values: template.values,
    }];
  });
}

/**
 * Resolves inherited templates in parent-first order. A direct template with
 * the same FieldId replaces its ancestor's binding without copying either
 * Field Definition or Value Nodes into a parallel schema.
 */
export function getSupertagTemplateFields(
  index: TanaIndex,
  supertagId: NodeId
): ResolvedSupertagTemplateField[] {
  const templatesByFieldId = new Map<NodeId, ResolvedSupertagTemplateField>();
  const orderedFieldIds: NodeId[] = [];

  [...getSupertagInheritance(index, supertagId), supertagId].forEach((definitionId) => {
    getDirectSupertagTemplateFields(index, definitionId).forEach((template) => {
      if (!templatesByFieldId.has(template.fieldId)) orderedFieldIds.push(template.fieldId);
      templatesByFieldId.set(template.fieldId, template);
    });
  });

  return orderedFieldIds.flatMap((fieldId) => {
    const template = templatesByFieldId.get(fieldId);

    return template ? [template] : [];
  });
}

/**
 * Candidate values are an ordered projection of real nodes. Options may use
 * static child Nodes, one-hop Reference child sources, or Search child
 * sources; none of those sources writes a candidate list into the document.
 */
export function getFieldValueCandidates(index: TanaIndex, fieldId: NodeId): TanaNode[] {
  return resolveFieldValueCandidates(index, fieldId, runTanaQuery);
}

function formatNodeNames(nodes: readonly TanaNode[]): string {
  if (nodes.length === 0) return '无';

  return nodes.map((node) => node.text || '未命名节点').join('、');
}

function getNodeAtDocumentPath(
  index: TanaIndex,
  path: Path
): TanaNode | undefined {
  const candidate = index.document[path[0]];
  const id = ElementApi.isElement(candidate) ? candidate.id : undefined;

  return typeof id === 'string' ? index.nodesById.get(id) : undefined;
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
      (!hiddenFieldNodeIds.has(descriptor.fieldNodeId) &&
        !(
          descriptor.visibilityPolicy === 'always' ||
          (descriptor.visibilityPolicy === 'when-empty' && !descriptor.hasStoredValue) ||
          (descriptor.visibilityPolicy === 'when-non-empty' && descriptor.hasStoredValue) ||
          (descriptor.visibilityPolicy === 'when-default' && descriptor.isDefaultValue)
        )),
  });
  const parentPath = getTanaParentPath(index.document, node.path);
  const parent = parentPath
    ? getNodeAtDocumentPath(index, parentPath)
    : undefined;
  const children = getTanaDirectChildPaths(index.document, node.path)
    .map((childPath) => getNodeAtDocumentPath(index, childPath))
    .filter(
      (child): child is TanaNode =>
        !!child &&
        !hasNodeSemantic(child.node, 'field', {
          document: index.document,
          path: child.path,
        }) &&
        !hasNodeSemantic(child.node, 'value', {
          document: index.document,
          path: child.path,
        })
    );
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
    const fieldDefinitionInTrash = isTanaNodeInTrash(index, fieldNode.fieldId);

    if (fieldNode.brokenFieldDefinition || !field?.fieldDefinition) {
      return [
        withVisibility({
          brokenFieldDefinition: true,
          fieldDefinitionInTrash,
          fieldId: fieldNode.fieldId,
          fieldNodeId: fieldNode.id,
          hasStoredValue: fieldNode.hasStoredValue,
          key: fieldNode.id,
          label: fieldDefinitionInTrash
            ? `${field?.text || '字段'}（已移至回收站）`
            : '已删除字段',
          source: 'custom',
        }),
      ];
    }

    const matchingTemplates = supertagIds.flatMap((supertagId) =>
      getSupertagTemplateFields(index, supertagId).flatMap((template) =>
        template.fieldId === fieldNode.fieldId ? [{ supertagId, template }] : []
      )
    );
    const matchingSupertagIds = matchingTemplates.map(({ supertagId }) => supertagId);

    return [
      withVisibility({
        definition: field.fieldDefinition,
        fieldId: field.id,
        fieldNodeId: fieldNode.id,
        hasStoredValue: fieldNode.hasStoredValue,
        isDefaultValue: isTanaFieldNodeAtTemplateDefault(
          index.document,
          fieldNode.path
        ),
        key: fieldNode.id,
        label: field.text || '未命名字段',
        pinned: matchingTemplates.some(({ template }) => template.pinned),
        source: matchingSupertagIds.length > 0 ? 'supertag' : 'custom',
        visibilityPolicy: field.fieldDefinition.visibility ?? 'never',
        ...(matchingSupertagIds.length > 0
          ? { supertagIds: matchingSupertagIds }
          : {}),
      }),
    ];
  });

  return [
    ...system,
    ...semanticFields.sort(
      (left, right) => Number(right.pinned === true) - Number(left.pinned === true)
    ),
  ];
}
