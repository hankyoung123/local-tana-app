import { ElementApi, TextApi } from 'platejs';
import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import { isTanaNumberInRange, isTanaStringFieldValueValid } from './field-value';
import { getNodeSupertagIds, getSupertagInheritance } from './index';
import { isTanaDay } from './time';
import { hasNodeSemantic } from './node-semantic';
import {
  getTanaAncestorPaths,
  getTanaDirectChildPaths,
  getTanaParentPath,
} from './outliner';
import type {
  FieldDefinition,
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
  /** Explicit template defaults live only on external Field occurrence Values. */
  value?: FieldValue;
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
  pinned?: boolean;
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
  fieldId: NodeId,
  value: FieldValue
): boolean {
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;

  if (!definition) return false;
  if (!isFieldValueCompatible(definition, value)) return false;

  if (definition.type === 'date' && value.type === 'date') {
    return isTanaDay(value.value);
  }

  if (
    (definition.type === 'email' && value.type === 'email') ||
    (definition.type === 'url' && value.type === 'url')
  ) {
    return isTanaStringFieldValueValid(definition.type, value.value);
  }

  if (definition.type === 'number' && value.type === 'number') {
    return isTanaNumberInRange(definition, value.value);
  }

  if (definition.type === 'options' && value.type === 'options') {
    return getFieldValueCandidates(index, fieldId).some(
      (candidate) => candidate.id === value.value
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
  return index.fieldValues.get(nodeId)?.has(fieldId) ?? false;
}

export function getFieldDefinitionCandidatesFromIndex(
  index: TanaIndex
): FieldDefinitionCandidate[] {
  return Array.from(index.nodesById.values()).flatMap((node) =>
    node.semanticTypes.includes('field-definition') && node.fieldDefinition
      ? [{ ...node, fieldDefinition: node.fieldDefinition }]
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
      value: template.value,
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

/** Candidate values are always derived from NodeIds already present in the index. */
export function getFieldValueCandidates(
  index: TanaIndex,
  fieldId: NodeId
): TanaNode[] {
  const definitionNode = index.nodesById.get(fieldId);
  const definition = definitionNode?.fieldDefinition;

  if (!definition || !definitionNode) return [];

  if (definition.type === 'options') {
    return getTanaDirectChildPaths(index.document, definitionNode.path)
      .map((path) => getNodeAtDocumentPath(index, path))
      .filter((node): node is TanaNode => !!node);
  }

  if (definition.type !== 'from-supertag' || !definition.sourceSupertagId) {
    return [];
  }

  return (index.nodesBySupertag.get(definition.sourceSupertagId) ?? []).flatMap(
    (nodeId) => {
      const node = index.nodesById.get(nodeId);

      return node ? [node] : [];
    }
  );
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
      !hiddenFieldNodeIds.has(descriptor.fieldNodeId),
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

    if (!field?.fieldDefinition) return [];

    const matchingSupertagIds = supertagIds.filter((supertagId) =>
      getSupertagTemplateFields(index, supertagId).some(
        (template) => template.fieldId === fieldNode.fieldId
      )
    );

    return [
      withVisibility({
        definition: field.fieldDefinition,
        fieldId: field.id,
        fieldNodeId: fieldNode.id,
        key: fieldNode.id,
        label: field.text || '未命名字段',
        pinned: fieldNode.node.tanaFieldPinned === true,
        source: matchingSupertagIds.length > 0 ? 'supertag' : 'custom',
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
