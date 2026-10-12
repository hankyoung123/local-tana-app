import { resolveTanaNodeTitle } from './title';
import type { Descendant, Path, TElement, Value } from 'platejs';

import { KEYS, TextApi } from 'platejs';

import { isTanaNodeElement, TANA_DATE_OBJECT_KEY, TANA_SUPERTAG_KEY } from './constants';
import { getFieldValueValidationIssues } from './field-value';
import { resolveFieldValueCandidates } from './field-candidates';
import { runTanaQuery } from './query';
import {
  getNodeSemanticType,
  getNodeSemanticTypes,
  hasNodeSemantic,
} from './node-semantic';
import { getTanaDirectChildPaths, getTanaParentPath } from './outliner';
import {
  getTanaCalendarReferenceTimes,
  getTanaDayParts,
  getTanaTimeKey,
  parseTanaDateValue,
} from './time';
import type {
  FieldId,
  FieldValidationIssue,
  FieldValue,
  TanaInternalReference,
  TanaQueryExpression,
  TanaCalendarDateReference,
  TanaDateObject,
  TanaDoneState,
  TanaSupertagCheckboxFieldMapping,
  NodeId,
  ReferenceRelation,
  SupertagDefinition,
  TanaBlockElement,
  TanaFieldNode,
  TanaIndex,
  TanaNode,
  TanaSystemNode,
} from './types';

type MentionElement = TElement & {
  key?: unknown;
};

export type NodeReferenceCandidate = Pick<TanaNode, 'id' | 'text'>;
export type SupertagCandidate = NodeReferenceCandidate & {
  definition: SupertagDefinition;
};

/**
 * Inline references own only a direct canonical NodeId. Their target is never
 * followed through a Reference occurrence, so historical chains stay visible
 * as unavailable rather than becoming an implicit second hop.
 */
export type TanaReferenceTargetResolution =
  | { status: 'live'; target: TanaNode }
  | { status: 'missing' | 'invalid' }
  | { status: 'trashed'; target: TanaNode };

/** Detects a persisted inheritance cycle before consumers derive a partial schema. */
export function hasSupertagInheritanceCycle(
  index: Pick<TanaIndex, 'nodesById'>,
  supertagId: NodeId
): boolean {
  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (id: NodeId): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    const node = index.nodesById.get(id);
    if (!node?.supertagDefinition) return false;

    visiting.add(id);
    const parents = node.supertagDefinition.extends;
    const hasCycle = Array.isArray(parents) && parents.some(
      (parentId) => typeof parentId === 'string' && visit(parentId)
    );
    visiting.delete(id);
    visited.add(id);

    return hasCycle;
  };

  return visit(supertagId);
}

function resolveSupertagInheritance(
  index: Pick<TanaIndex, 'nodesById'>,
  supertagId: NodeId
): NodeId[] | undefined {
  const ordered: NodeId[] = [];
  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (id: NodeId, includeSelf: boolean): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;

    const node = index.nodesById.get(id);

    if (!node?.supertagDefinition) return false;

    visiting.add(id);
    const parents = node.supertagDefinition.extends ?? [];

    if (!Array.isArray(parents) || parents.some((parentId) => typeof parentId !== 'string')) {
      visiting.delete(id);
      return false;
    }

    for (const parentId of parents) {
      if (!visit(parentId, true)) {
        visiting.delete(id);
        return false;
      }
    }

    visiting.delete(id);
    visited.add(id);

    if (includeSelf) ordered.push(id);

    return true;
  };

  return visit(supertagId, false) ? ordered : undefined;
}

/** Resolves a definition's ancestors in parent-first order without recursion loops. */
export function getSupertagInheritance(
  index: Pick<TanaIndex, 'nodesById'>,
  supertagId: NodeId
): NodeId[] {
  return resolveSupertagInheritance(index, supertagId) ?? [];
}

export function isSupertagInheritanceUsable(
  index: Pick<TanaIndex, 'nodesById' | 'parentNodeIds' | 'systemNodeIds'>,
  supertagId: NodeId
): boolean {
  const definition = index.nodesById.get(supertagId);
  const inheritance = resolveSupertagInheritance(index, supertagId);

  if (
    !definition?.supertagDefinition ||
    !isTanaNodeActive(index, supertagId) ||
    hasSupertagInheritanceCycle(index, supertagId) ||
    !inheritance
  ) return false;

  return inheritance.every((ancestorId) => {
    const ancestor = index.nodesById.get(ancestorId);

    return !!ancestor?.supertagDefinition &&
      isTanaNodeActive(index, ancestorId);
  });
}

function isElement(node: Descendant): node is TElement {
  return 'children' in node && Array.isArray(node.children);
}

function getReferenceTarget(element: TElement): NodeId | undefined {
  if (element.type !== KEYS.mention) return;

  const key = (element as MentionElement).key;

  return typeof key === 'string' ? key : undefined;
}

function getReferenceTargetByKey(element: TElement): NodeId | undefined {
  const key = (element as MentionElement).key;

  return typeof key === 'string' ? key : undefined;
}

function getRawElementText(element: TElement): string {
  return element.children
    .map((child) => {
      if (TextApi.isText(child)) return child.text;

      return isElement(child) ? getRawElementText(child) : '';
    })
    .join('');
}

function findMentionTarget(element: TElement): NodeId | undefined {
  const ownTarget = getReferenceTarget(element);

  if (ownTarget) return ownTarget;

  for (const child of element.children) {
    if (TextApi.isText(child) || !isElement(child)) continue;

    const target = findMentionTarget(child);

    if (target) return target;
  }
}

/**
 * Decodes a stored Value by its own marker, never by the current Definition.
 * Type changes therefore preserve historical text and identity as readable
 * (possibly warned) document state.
 */
function getFieldValueFromNode(
  valueNode: TanaNode | undefined
): FieldValue | undefined {
  if (!valueNode) return;

  const valueElement = valueNode.node as TanaBlockElement;
  const type = valueElement.tanaFieldValueType;

  if (!type) return;

  const text = getRawElementText(valueElement);

  if (type === 'plain') {
    return text.length > 0 ? { type: 'plain', value: text } : undefined;
  }

  if (type === 'date') {
    return text.length > 0 ? { type: 'date', value: text } : undefined;
  }

  if (type === 'email' || type === 'url') {
    return text.length > 0 ? { type, value: text } : undefined;
  }

  if (type === 'number') {
    const normalized = text.trim();

    if (
      normalized.length === 0 ||
      !/^[+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(
        normalized
      )
    ) {
      return;
    }

    const value = Number(normalized);

    return Number.isFinite(value) ? { type: 'number', value } : undefined;
  }

  if (type === 'checkbox') {
    if (text === 'true') return { type: 'checkbox', value: true };
    if (text === 'false') return { type: 'checkbox', value: false };

    return;
  }

  const targetNodeId = findMentionTarget(valueElement);

  if (!targetNodeId) return;

  return type === 'options'
    ? { type: 'options', value: targetNodeId }
    : { type: 'from-supertag', value: targetNodeId };
}

function getUndecodableFieldValueIssues(
  valueNode: TanaNode
): readonly FieldValidationIssue[] {
  switch ((valueNode.node as TanaBlockElement).tanaFieldValueType) {
    case 'checkbox':
      return ['invalid-checkbox'];
    case 'number':
      return ['invalid-number'];
    case 'options':
    case 'from-supertag':
      return ['missing-reference'];
    default:
      return [];
  }
}

function hasStoredFieldValue(valueNode: TanaNode): boolean {
  const element = valueNode.node as TanaBlockElement;

  return getRawElementText(element).trim().length > 0 || !!findMentionTarget(element);
}

/** Fully derives the read-only semantic index from the current Plate value. */
export function buildTanaIndex(document: Value): TanaIndex {
  const nodesById = new Map<NodeId, TanaNode>();
  const backlinks = new Map<NodeId, ReferenceRelation[]>();
  const references: ReferenceRelation[] = [];
  const referenceTargetsByNode = new Map<NodeId, NodeId>();
  const nodesBySupertag = new Map<NodeId, NodeId[]>();
  const childrenByParent = new Map<NodeId, NodeId[]>();
  const fieldNodesById = new Map<NodeId, TanaFieldNode>();
  const fieldNodesByParent = new Map<NodeId, TanaFieldNode[]>();
  const fieldValues = new Map<NodeId, Map<FieldId, FieldValue>>();
  const parentNodeIds = new Map<NodeId, NodeId | undefined>();
  const systemNodeIds = new Map<TanaSystemNode, NodeId>();
  const timeNodeIds = new Map<string, NodeId>();
  const dateObjects: TanaDateObject[] = [];
  const orderedNodes: TanaNode[] = [];

  document.forEach((descendant, index) => {
    const path = [index];

    if (!isElement(descendant) || !isTanaNodeElement(descendant, path)) return;
    if (typeof descendant.id !== 'string' || descendant.id.length === 0) return;

    const tanaNode = descendant as TanaBlockElement;
    const semanticContext = { document, path };
    const node: TanaNode = {
      doneState: tanaNode.tanaDoneState,
      fieldDefinition: tanaNode.tanaFieldDefinition,
      id: descendant.id,
      node: descendant,
      path,
      presentation: tanaNode.tanaPresentation,
      referenceTargetId: tanaNode.tanaReferenceTargetId,
      searchDefinition: tanaNode.tanaSearchDefinition,
      semanticType: getNodeSemanticType(tanaNode, semanticContext),
      semanticTypes: getNodeSemanticTypes(tanaNode, semanticContext),
      supertagDefinition: tanaNode.tanaSupertagDefinition,
      supertagIds: Array.isArray(tanaNode.tanaSupertagIds)
        ? tanaNode.tanaSupertagIds.filter(
            (supertagId): supertagId is NodeId =>
              typeof supertagId === 'string' && supertagId.length > 0
          )
        : [],
      systemNode: tanaNode.tanaSystemNode,
      time: tanaNode.tanaTime,
      workspaceUi: tanaNode.tanaWorkspaceUi,
      createdAt: tanaNode.tanaCreatedAt,
      lastEditedAt: tanaNode.tanaLastEditedAt,
      doneAt: tanaNode.tanaDoneAt,
      rawText: '',
      text: '',
      viewDefinition: tanaNode.tanaViewDefinition,
    };

    nodesById.set(node.id, node);
    orderedNodes.push(node);
  });

  const resolvedNames = new Map<NodeId, string>();

  function resolveNodeName(nodeId: NodeId, resolving: Set<NodeId>): string {
    const cached = resolvedNames.get(nodeId);

    if (cached !== undefined) return cached;
    if (resolving.has(nodeId)) return '';

    const tanaNode = nodesById.get(nodeId);

    if (!tanaNode) return '';

    const nextResolving = new Set(resolving).add(nodeId);
    const text = getElementText(tanaNode.node, nextResolving).trim();

    resolvedNames.set(nodeId, text);

    return text;
  }

  function getElementText(element: TElement, resolving: Set<NodeId>): string {
    return element.children
      .map((child) => {
        if (TextApi.isText(child)) return child.text;

        if (child.type === TANA_SUPERTAG_KEY) {
          // `#` is presentation for semantic membership. It never belongs in
          // canonical title/search text; `tanaSupertagIds` is the only truth.
          return '';
        }

        if (child.type === TANA_DATE_OBJECT_KEY) {
          const dateValue = (child as TElement & { tanaDateValue?: unknown }).tanaDateValue;
          return typeof dateValue === 'string' ? dateValue : '';
        }

        if (child.type === KEYS.mention) {
          const targetNodeId = getReferenceTargetByKey(child);
          const targetName = targetNodeId
            ? resolveNodeName(targetNodeId, resolving)
            : '';

          return `@${targetName}`;
        }

        return getElementText(child, resolving);
      })
      .join('');
  }

  orderedNodes.forEach((node) => {
    const rawText = resolveNodeName(node.id, new Set());

    nodesById.set(node.id, {
      ...node,
      rawText,
      text: rawText,
    });
  });

  const resolvedNodes = orderedNodes.flatMap((node) => {
    const resolved = nodesById.get(node.id);

    return resolved ? [resolved] : [];
  });
  const nodeIdsByDocumentIndex = new Map(
    resolvedNodes.map((node) => [node.path[0], node.id])
  );

  resolvedNodes.forEach((node) => {
    const parentPath = getTanaParentPath(document, node.path);
    const parentNodeId = parentPath
      ? nodeIdsByDocumentIndex.get(parentPath[0])
      : undefined;

    parentNodeIds.set(node.id, parentNodeId);

    if (parentNodeId) {
      const children = childrenByParent.get(parentNodeId) ?? [];

      children.push(node.id);
      childrenByParent.set(parentNodeId, children);
    }

    if (node.systemNode) systemNodeIds.set(node.systemNode, node.id);
    if (node.time) timeNodeIds.set(getTanaTimeKey(node.time), node.id);

    node.supertagIds.forEach((supertagId) => {
      // This is a direct projection of membership only. Definition
      // inheritance is resolved separately and never fabricates instances.
      const taggedNodes = nodesBySupertag.get(supertagId) ?? [];

      if (!taggedNodes.includes(node.id)) taggedNodes.push(node.id);
      nodesBySupertag.set(supertagId, taggedNodes);
    });
  });

  // Title expressions are display-only and may only come from active,
  // semantically valid definitions. Resolve after hierarchy and Trash scope
  // are known so stale definitions cannot affect a node's displayed title.
  const activeScope = { nodesById, parentNodeIds, systemNodeIds };

  orderedNodes.forEach((node) => {
    const resolved = nodesById.get(node.id);

    if (!resolved) return;
    let titleExpression: string | undefined;

    resolved.supertagIds.forEach((assignedId) => {
      if (!isSupertagInheritanceUsable(activeScope, assignedId)) return;

      [...getSupertagInheritance(activeScope, assignedId), assignedId].forEach(
        (definitionId) => {
          const expression = nodesById.get(definitionId)?.supertagDefinition?.titleExpression;

          if (expression !== undefined) titleExpression = expression;
        }
      );
    });

    nodesById.set(node.id, { ...resolved, titleExpression });
  });

  // A trashed definition remains indexed with its Value history, but cannot
  // act as a live definition until Lifecycle restores the same canonical Node.
  const isNodeInDerivedTrash = (nodeId: NodeId): boolean => {
    const trashNodeId = systemNodeIds.get('trash');
    const visited = new Set<NodeId>();
    let currentNodeId: NodeId | undefined = nodeId;

    while (trashNodeId && currentNodeId && !visited.has(currentNodeId)) {
      if (currentNodeId === trashNodeId) return true;
      visited.add(currentNodeId);
      currentNodeId = parentNodeIds.get(currentNodeId);
    }

    return false;
  };

  function addReference(relation: ReferenceRelation) {
    references.push(relation);

    const relations = backlinks.get(relation.targetNodeId) ?? [];

    relations.push(relation);
    backlinks.set(relation.targetNodeId, relations);
  }

  function visitSemanticChild(
    descendant: Descendant,
    path: Path,
    sourceNodeId: NodeId
  ): void {
    if (!isElement(descendant)) return;

    if (descendant.type === TANA_DATE_OBJECT_KEY) {
      const value = (descendant as TElement & { tanaDateValue?: unknown }).tanaDateValue;
      if (typeof value === 'string') dateObjects.push({ path, sourceNodeId, value });
    }

    const targetNodeId = getReferenceTarget(descendant);

    if (targetNodeId) {
      addReference({ kind: 'inline', path, sourceNodeId, targetNodeId });
    }

    descendant.children.forEach((child, index) => {
      visitSemanticChild(child, [...path, index], sourceNodeId);
    });
  }

  resolvedNodes.forEach((node) => {
    if (node.referenceTargetId) {
      referenceTargetsByNode.set(node.id, node.referenceTargetId);
      addReference({
        kind: 'node',
        path: node.path,
        sourceNodeId: node.id,
        targetNodeId: node.referenceTargetId,
      });
    }

    node.node.children.forEach((child, index) => {
      visitSemanticChild(child, [...node.path, index], node.id);
    });
  });

  resolvedNodes.forEach((node) => {
    if (!hasNodeSemantic(node.node, 'field', { document, path: node.path })) {
      return;
    }

    const fieldId = (node.node as TanaBlockElement).tanaFieldId;
    const parentPath = getTanaParentPath(document, node.path);
    const parentNodeId = parentPath
      ? nodeIdsByDocumentIndex.get(parentPath[0])
      : undefined;

    if (!fieldId || !parentNodeId) return;

    const definitionNode = nodesById.get(fieldId);
    const definition =
      definitionNode && hasNodeSemantic(definitionNode.node, 'field-definition', {
        document,
        path: definitionNode.path,
      }) && !isNodeInDerivedTrash(definitionNode.id)
        ? definitionNode.fieldDefinition
        : undefined;
    const valueNodes = getTanaDirectChildPaths(document, node.path).flatMap(
      (childPath) => {
        const childId = nodeIdsByDocumentIndex.get(childPath[0]);
        const child = childId ? nodesById.get(childId) : undefined;

        return child && hasNodeSemantic(child.node, 'value', {
          document,
          path: child.path,
        })
          ? [child]
          : [];
      }
    );
    // Options and From-Supertag candidates need the complete derived index
    // (including one-hop Reference and Search sources). Validation is filled
    // in after this initial read-only index has been constructed below.
    const candidateIds = undefined;
    const valueEntries = valueNodes.flatMap((valueNode) => {
      const parsedValue = getFieldValueFromNode(valueNode);

      return parsedValue ? [[valueNode.id, parsedValue] as const] : [];
    });
    const validationIssuesByValueNodeId = new Map(
      valueNodes.map((valueNode) => {
        const value = valueEntries.find(([valueNodeId]) => valueNodeId === valueNode.id)?.[1];
        const issues = definition
          ? value
            ? getFieldValueValidationIssues(definition, value, candidateIds)
            : getUndecodableFieldValueIssues(valueNode)
          : [];

        return [valueNode.id, issues] as const;
      })
    );
    const values = valueEntries.map(([, value]) => value);
    const cardinality = definition?.cardinality ?? 'single';
    const valueNode = valueNodes[0];
    const value = cardinality === 'single' ? values[0] : undefined;
    const fieldNode: TanaFieldNode = {
      brokenFieldDefinition: !definition,
      fieldId,
      hasStoredValue: valueNodes.some(hasStoredFieldValue),
      id: node.id,
      node: node.node as TanaBlockElement,
      parentNodeId,
      path: node.path,
      value,
      valueByNodeId: new Map(valueEntries),
      valueNodeId: valueNode?.id,
      valueNodeIds: valueNodes.map((valueNode) => valueNode.id),
      validationIssues: definition?.required === true &&
        !valueNodes.some(hasStoredFieldValue)
        ? ['missing-required']
        : [],
      validationIssuesByValueNodeId,
      values,
    };
    const fields = fieldNodesByParent.get(parentNodeId) ?? [];

    fields.push(fieldNode);
    fieldNodesByParent.set(parentNodeId, fields);
    fieldNodesById.set(fieldNode.id, fieldNode);

    if (fieldNode.value && !fieldValues.get(parentNodeId)?.has(fieldId)) {
      const values = fieldValues.get(parentNodeId) ?? new Map<FieldId, FieldValue>();

      values.set(fieldId, fieldNode.value);
      fieldValues.set(parentNodeId, values);
    }
  });

  const index: TanaIndex = {
    backlinks,
    childrenByParent,
    dateObjects,
    document,
    fieldNodesById,
    fieldNodesByParent,
    fieldValues,
    nodesById,
    parentNodeIds,
    nodesBySupertag,
    references,
    referenceTargetsByNode,
    systemNodeIds,
    timeNodeIds,
  };

  for (const [parentId, fields] of fieldNodesByParent) {
    const updated = fields.map((field) => {
      const definition = field.brokenFieldDefinition
        ? undefined
        : index.nodesById.get(field.fieldId)?.fieldDefinition;
      const candidateIds = definition && (definition.type === 'options' || definition.type === 'from-supertag')
        ? new Set(resolveFieldValueCandidates(
            index,
            field.fieldId,
            (queryIndex, expression, searchHostId) =>
              runTanaQuery(queryIndex, expression, { searchHostId }),
            getActiveSupertagInstances
          ).map(({ id }) => id))
        : undefined;
      const validationIssuesByValueNodeId = new Map(
        field.valueNodeIds.map((valueNodeId) => {
          const value = field.valueByNodeId.get(valueNodeId);
          const valueNode = index.nodesById.get(valueNodeId);
          return [
            valueNodeId,
            definition
              ? value
                ? getFieldValueValidationIssues(definition, value, candidateIds)
                : valueNode ? getUndecodableFieldValueIssues(valueNode) : []
              : [],
          ] as const;
        })
      );
      return { ...field, validationIssuesByValueNodeId };
    });
    fieldNodesByParent.set(parentId, updated);
    updated.forEach((field) => fieldNodesById.set(field.id, field));
  }

  return index;
}

export * from './time';
export * from './title';

export function getNodeDisplayNameFromIndex(
  index: TanaIndex,
  nodeId: NodeId
): string {
  return index.nodesById.get(nodeId)?.text ?? 'Unknown node';
}

export function getSupertagCandidatesFromIndex(
  index: TanaIndex
): SupertagCandidate[] {
  return Array.from(index.nodesById.values())
    .filter(
      (node): node is TanaNode & { supertagDefinition: SupertagDefinition } =>
        isTanaNodeActive(index, node.id) &&
        node.semanticTypes.includes('supertag-definition') &&
        isSupertagInheritanceUsable(index, node.id) &&
        node.supertagDefinition?.buildingBlock?.hiddenFromSearch !== true &&
        node.text.length > 0
    )
    .map(({ id, supertagDefinition: definition, text }) => ({
      definition,
      id,
      text,
    }));
}

export function getNodeSupertagIds(
  index: TanaIndex,
  nodeId: NodeId
): NodeId[] {
  return [...(index.nodesById.get(nodeId)?.supertagIds ?? [])];
}

/** Resolves direct and inherited membership without changing canonical metadata. */
export function hasTanaSupertag(
  index: TanaIndex,
  nodeId: NodeId,
  supertagId: NodeId
): boolean {
  const requested = index.nodesById.get(supertagId);
  const node = index.nodesById.get(nodeId);

  if (
    !requested?.supertagDefinition ||
    !isSupertagInheritanceUsable(index, supertagId) ||
    !node
  ) return false;

  return node.supertagIds.some((assignedId) => {
    const assigned = index.nodesById.get(assignedId);

    return !!assigned?.supertagDefinition &&
      isSupertagInheritanceUsable(index, assignedId) &&
      (assignedId === supertagId ||
        getSupertagInheritance(index, assignedId).includes(supertagId));
  });
}

export function getNodeReferenceCandidatesFromIndex(
  index: TanaIndex
): NodeReferenceCandidate[] {
  return Array.from(index.nodesById.values())
    .filter(
      (node) =>
        isTanaNodeActive(index, node.id) &&
        node.referenceTargetId === undefined &&
        !node.semanticTypes.includes('field') &&
        !node.semanticTypes.includes('value') &&
        node.time === undefined &&
        node.text.length > 0
    )
    .map(({ id, text }) => ({ id, text }));
}

/**
 * Trash is a derived query scope, not persisted Node state. Keep its complete
 * subtree indexed so canonical references and backlinks remain resolvable.
 */
export function isTanaNodeInTrash(
  index: Pick<TanaIndex, 'parentNodeIds' | 'systemNodeIds'>,
  nodeId: NodeId
): boolean {
  const trashNodeId = index.systemNodeIds.get('trash');

  if (!trashNodeId) return false;

  const visited = new Set<NodeId>();
  let currentNodeId: NodeId | undefined = nodeId;

  while (currentNodeId && !visited.has(currentNodeId)) {
    if (currentNodeId === trashNodeId) return true;

    visited.add(currentNodeId);
    currentNodeId = index.parentNodeIds.get(currentNodeId);
  }

  return false;
}

/**
 * Discovery surfaces share this transient scope: system Nodes and the Trash
 * subtree remain resolvable canonical Nodes, but are never active results or
 * candidates for new user-authored relations.
 */
export function isTanaNodeActive(
  index: Pick<TanaIndex, 'nodesById' | 'parentNodeIds' | 'systemNodeIds'>,
  nodeId: NodeId
): boolean {
  const node = index.nodesById.get(nodeId);

  return (
    !!node && node.systemNode === undefined && !isTanaNodeInTrash(index, nodeId)
  );
}

export type TanaSupertagCheckboxConfig = {
  show: boolean;
  checked: TanaDoneState;
  unchecked: readonly TanaDoneState[];
  checkedFieldMapping?: TanaSupertagCheckboxFieldMapping;
  uncheckedFieldMapping?: TanaSupertagCheckboxFieldMapping;
  sourceSupertagId?: NodeId;
};

function isUsableSupertagCheckboxFieldMapping(
  index: TanaIndex,
  mapping: TanaSupertagCheckboxFieldMapping
): boolean {
  const fieldNode = index.nodesById.get(mapping.fieldId);
  const definition = fieldNode?.fieldDefinition;

  if (
    !fieldNode ||
    !definition ||
    !isTanaNodeActive(index, mapping.fieldId) ||
    !Array.isArray(mapping.values) ||
    mapping.values.length === 0 ||
    (definition.cardinality === 'single' && mapping.values.length > 1)
  ) {
    return false;
  }

  const candidateIds =
    definition.type === 'options' || definition.type === 'from-supertag'
      ? new Set(
          resolveFieldValueCandidates(
            index,
            mapping.fieldId,
            (queryIndex, expression, searchHostId) =>
              runTanaQuery(queryIndex, expression, { searchHostId }),
            getActiveSupertagInstances
          ).map(({ id }) => id)
        )
      : undefined;

  return mapping.values.every(
    (value) => getFieldValueValidationIssues(definition, value, candidateIds).length === 0
  );
}

/** Counts stored Value Nodes that still point at one option Node.
 *
 * The count is derived from the canonical index so deleting an Option can
 * explain its impact without introducing an auxiliary usage cache. Historical
 * values remain countable and will surface as `invalid-option` after removal.
 */
export function countTanaFieldOptionUsages(
  index: Pick<TanaIndex, 'fieldNodesById'>,
  fieldId: NodeId,
  optionId: NodeId
): number {
  let count = 0;

  for (const field of index.fieldNodesById.values()) {
    if (field.fieldId !== fieldId) continue;

    for (const value of field.values) {
      if ((value.type === 'options' || value.type === 'from-supertag') && value.value === optionId) {
        count += 1;
      }
    }
  }

  return count;
}

/**
 * Resolves the completion control configured by the node's direct tags.
 * Definitions are applied parent-first; later direct tags win, matching the
 * document order used for semantic membership. This stays derived from the
 * canonical index and never creates a second completion state.
 */
export function resolveTanaSupertagCheckboxConfig(
  index: TanaIndex,
  nodeId: NodeId
): TanaSupertagCheckboxConfig {
  const result: TanaSupertagCheckboxConfig = {
    show: false,
    checked: 'done',
    unchecked: ['todo'],
  };
  const node = index.nodesById.get(nodeId);

  if (!node || !isTanaNodeActive(index, nodeId)) return result;

  for (const directSupertagId of node.supertagIds) {
    if (!isSupertagInheritanceUsable(index, directSupertagId)) continue;

    const chain = [
      ...getSupertagInheritance(index, directSupertagId),
      directSupertagId,
    ];

    for (const supertagId of chain) {
      const definition = index.nodesById.get(supertagId)?.supertagDefinition;

      if (!definition) continue;

      let configured = false;

      if (typeof definition.showCheckbox === 'boolean') {
        result.show = definition.showCheckbox;
        configured = true;
      }
      if (definition.doneStateMapping?.checked) {
        result.checked = definition.doneStateMapping.checked;
        configured = true;
      }
      if (definition.doneStateMapping?.unchecked?.length) {
        result.unchecked = definition.doneStateMapping.unchecked;
        configured = true;
      }

      if (Object.prototype.hasOwnProperty.call(definition, 'checkboxFieldMapping')) {
        const fieldMapping = definition.checkboxFieldMapping;
        result.checkedFieldMapping =
          fieldMapping?.checked && isUsableSupertagCheckboxFieldMapping(index, fieldMapping.checked)
            ? fieldMapping.checked
            : undefined;
        result.uncheckedFieldMapping =
          fieldMapping?.unchecked && isUsableSupertagCheckboxFieldMapping(index, fieldMapping.unchecked)
            ? fieldMapping.unchecked
            : undefined;
        configured = true;
      }

      if (configured) result.sourceSupertagId = supertagId;
    }
  }

  return result;
}

function comparePaths(left: Path, right: Path): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = left[index]! - right[index]!;

    if (difference !== 0) return difference;
  }

  return left.length - right.length;
}

/**
 * Calendar Year Nodes use an ISO week-year because they own Week Nodes.
 * Their interval therefore begins with ISO week 01 rather than on Jan 1.
 * Other Calendar Node units retain the shared date-value interval.
 */
function getCalendarNodeInterval(time: TanaNode['time']) {
  if (!time || !['day', 'week', 'month', 'year'].includes(time.unit)) return;

  if (time.unit !== 'year') return parseTanaDateValue(time.value);

  const firstWeek = parseTanaDateValue(`${time.value}-W01`);
  const lastWeekNumber = getTanaDayParts(`${time.value}-12-28` as `${number}-${number}-${number}`).week;
  const lastWeek = parseTanaDateValue(
    `${time.value}-W${String(lastWeekNumber).padStart(2, '0')}`
  );

  return firstWeek && lastWeek
    ? { ...firstWeek, end: lastWeek.end }
    : undefined;
}

/**
 * Resolves a date value to already-existing, live Calendar Nodes. It is a
 * read-only relation: source values retain date strings and Calendar Nodes
 * retain their own NodeIds, so neither side gains a persisted link.
 */
export function getTanaCalendarReferenceNodeIds(
  index: TanaIndex,
  value: string
): readonly NodeId[] {
  const interval = parseTanaDateValue(value);

  if (!interval) return [];

  const directKeys = new Set(
    getTanaCalendarReferenceTimes(value).map((time) => getTanaTimeKey(time))
  );
  const references: NodeId[] = [];

  for (const node of index.nodesById.values()) {
    if (!node.time || !isTanaNodeActive(index, node.id)) continue;
    if (!['day', 'week', 'month', 'year'].includes(node.time.unit)) continue;

    const key = getTanaTimeKey(node.time);
    const calendarInterval = getCalendarNodeInterval(node.time);
    const overlaps =
      interval.granularity === 'range' &&
      !!calendarInterval &&
      calendarInterval.start <= interval.end &&
      interval.start <= calendarInterval.end;

    if (directKeys.has(key) || overlaps) references.push(node.id);
  }

  return references;
}

/**
 * Derives Date Object and Date Field Value relations to Calendar Nodes without
 * turning those values into ordinary node backlinks. The result is ordered by
 * its real Plate source location and carries no independent cache or state.
 */
export function getTanaCalendarDateReferences(
  index: TanaIndex
): readonly TanaCalendarDateReference[] {
  const references: TanaCalendarDateReference[] = [];

  index.dateObjects.forEach((dateObject) => {
    if (!isTanaNodeActive(index, dateObject.sourceNodeId) || !parseTanaDateValue(dateObject.value)) return;
    references.push({
      sourceNodeId: dateObject.sourceNodeId,
      sourcePath: dateObject.path,
      value: dateObject.value,
      calendarNodeIds: getTanaCalendarReferenceNodeIds(index, dateObject.value),
    });
  });

  for (const fields of index.fieldNodesByParent.values()) {
    for (const field of fields) {
      if (index.nodesById.get(field.fieldId)?.fieldDefinition?.type !== 'date') {
        continue;
      }

      for (const valueNodeId of field.valueNodeIds) {
        const value = field.valueByNodeId.get(valueNodeId);
        const valueNode = index.nodesById.get(valueNodeId);

        if (
          !valueNode ||
          !isTanaNodeActive(index, field.parentNodeId) ||
          !isTanaNodeActive(index, valueNode.id) ||
          value?.type !== 'date' ||
          !parseTanaDateValue(value.value)
        ) {
          continue;
        }

        references.push({
          // Keep the stored Value Node as the relation identity while exposing
          // its canonical owner for title and navigation in the UI.
          sourceNodeId: valueNodeId,
          ownerNodeId: field.parentNodeId,
          sourcePath: valueNode.path,
          value: value.value,
          calendarNodeIds: getTanaCalendarReferenceNodeIds(index, value.value),
        });
      }
    }
  }

  return references.sort((left, right) => comparePaths(left.sourcePath, right.sourcePath));
}

/**
 * Resolves an inline mention's one direct target without following Reference
 * edges. Missing targets stay distinguishable from targets that still exist
 * but are in Trash, a system scope, or an invalid Reference chain.
 */
export function getTanaReferenceTargetResolution(
  index: TanaIndex,
  targetNodeId: NodeId | undefined
): TanaReferenceTargetResolution {
  const target = targetNodeId ? index.nodesById.get(targetNodeId) : undefined;

  if (!target) return { status: 'missing' };

  if (isTanaNodeInTrash(index, target.id)) return { status: 'trashed', target };
  if (target.systemNode !== undefined || target.referenceTargetId !== undefined) {
    return { status: 'invalid' };
  }
  return { status: 'live', target };
}

function addInternalReference(
  references: TanaInternalReference[],
  seen: Set<string>,
  sourceNodeId: NodeId,
  targetNodeId: NodeId | undefined,
  kind: TanaInternalReference['kind'],
  relation: string,
  requestedTargetId: NodeId
) {
  if (!targetNodeId || targetNodeId !== requestedTargetId) return;
  const key = `${sourceNodeId}:${kind}:${relation}:${targetNodeId}`;
  if (seen.has(key)) return;
  seen.add(key);
  references.push({ kind, relation, sourceNodeId, targetNodeId });
}

function visitSearchInternalReferences(
  expression: TanaQueryExpression,
  sourceNodeId: NodeId,
  requestedTargetId: NodeId,
  references: TanaInternalReference[],
  seen: Set<string>
) {
  if (expression.type === 'and' || expression.type === 'or') {
    expression.children.forEach((child) =>
      visitSearchInternalReferences(child, sourceNodeId, requestedTargetId, references, seen)
    );
    return;
  }
  if (expression.type === 'not') {
    visitSearchInternalReferences(expression.child, sourceNodeId, requestedTargetId, references, seen);
    return;
  }
  if (expression.type !== 'predicate') return;
  const predicate = expression.predicate;
  if ('fieldId' in predicate) {
    addInternalReference(references, seen, sourceNodeId, predicate.fieldId, 'search', `field:${predicate.kind}`, requestedTargetId);
  }
  if ('supertagId' in predicate) {
    addInternalReference(references, seen, sourceNodeId, predicate.supertagId, 'search', `supertag:${predicate.kind}`, requestedTargetId);
  }
  if ('nodeId' in predicate) {
    addInternalReference(references, seen, sourceNodeId, predicate.nodeId, 'search', `node:${predicate.kind}`, requestedTargetId);
  }
}

/**
 * Derives configuration relations to a Node for the Trash inspector. Direct
 * block and inline References intentionally remain in `backlinks` and are not
 * included here.
 */
export function getTanaInternalReferences(
  index: TanaIndex,
  requestedTargetId: NodeId
): readonly TanaInternalReference[] {
  const references: TanaInternalReference[] = [];
  const seen = new Set<string>();

  for (const field of index.fieldNodesById.values()) {
    addInternalReference(references, seen, field.id, field.fieldId, 'field', 'definition', requestedTargetId);
    for (const valueNodeId of field.valueNodeIds) {
      const value = field.valueByNodeId.get(valueNodeId);
      if (value && (value.type === 'options' || value.type === 'from-supertag')) {
        addInternalReference(references, seen, field.id, value.value, 'field', `value:${value.type}`, requestedTargetId);
      }
    }
  }

  for (const node of index.nodesById.values()) {
    const element = node.node as TanaBlockElement;
    (node.supertagIds ?? []).forEach((supertagId) =>
      addInternalReference(references, seen, node.id, supertagId, 'supertag', 'membership', requestedTargetId)
    );
    const definition = node.supertagDefinition;
    if (definition) {
      (definition.extends ?? []).forEach((parentId) =>
        addInternalReference(references, seen, node.id, parentId, 'supertag', 'extends', requestedTargetId)
      );
      addInternalReference(
        references,
        seen,
        node.id,
        definition.defaultChildSupertagId,
        'supertag',
        'default-child-supertag',
        requestedTargetId
      );
    }
    addInternalReference(
      references,
      seen,
      node.id,
      element.tanaDefaultChildSupertagId,
      'supertag',
      'default-child-supertag',
      requestedTargetId
    );
    addInternalReference(
      references,
      seen,
      node.id,
      node.fieldDefinition?.type === 'from-supertag'
        ? node.fieldDefinition.sourceSupertagId ?? undefined
        : undefined,
      'field',
      'source-supertag',
      requestedTargetId
    );
    if (node.searchDefinition) {
      visitSearchInternalReferences(
        node.searchDefinition.query,
        node.id,
        requestedTargetId,
        references,
        seen
      );
    }
    const view = node.viewDefinition;
    if (view) {
      // View settings are saved per renderer. Keep legacy flat settings in
      // the reference graph while also traversing every concrete state so
      // deleting or renaming a Field cannot leave hidden dangling links.
      const viewStates = [view, ...Object.values(view.states ?? {})];
      viewStates.forEach((state) => {
        addInternalReference(references, seen, node.id, state.groupFieldId, 'view', 'group-field', requestedTargetId);
        (state.calendarDateFieldIds ?? []).forEach((fieldId) =>
          addInternalReference(references, seen, node.id, fieldId, 'view', 'calendar-field', requestedTargetId)
        );
        (state.visibleFieldIds ?? []).forEach((fieldId) =>
          addInternalReference(references, seen, node.id, fieldId, 'view', 'visible-field', requestedTargetId)
        );
        (state.sort ?? []).forEach((criterion) =>
          addInternalReference(
            references,
            seen,
            node.id,
            criterion.fieldId === '$title' ? undefined : criterion.fieldId,
            'view',
            'sort-field',
            requestedTargetId
          )
        );
        (state.filter?.clauses ?? []).forEach((clause) => {
          if ('fieldId' in clause) {
            addInternalReference(references, seen, node.id, clause.fieldId, 'view', `filter:${clause.kind}`, requestedTargetId);
          }
          if ('supertagId' in clause) {
            addInternalReference(references, seen, node.id, clause.supertagId, 'view', `filter:${clause.kind}`, requestedTargetId);
          }
        });
      });
    }
  }

  return references;
}

/** Resolve a projection to one live canonical Node, never follow Reference chains. */
export function getTanaProjectionTarget(
  index: TanaIndex,
  nodeId: NodeId | undefined
): TanaNode | undefined {
  if (!nodeId || !isTanaNodeActive(index, nodeId)) return;
  const node = index.nodesById.get(nodeId)!;
  if (node.referenceTargetId === undefined) return node;
  const target = index.nodesById.get(node.referenceTargetId);
  return target && target.referenceTargetId === undefined && isTanaNodeActive(index, target.id)
    ? target
    : undefined;
}

/** Active instances are derived from membership at the point of use. */
export function getActiveSupertagInstances(
  index: TanaIndex,
  supertagId: NodeId
): TanaNode[] {
  const definition = index.nodesById.get(supertagId);
  if (!definition?.supertagDefinition || !isSupertagInheritanceUsable(index, supertagId)) return [];
  return Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.length === 1 &&
      node.semanticTypes[0] === 'content' &&
      hasTanaSupertag(index, node.id, supertagId)
  );
}

/** Performs transient document-order node search without writing any state. */
export function searchTanaNodes(
  index: TanaIndex,
  query: string,
  limit = 20
): TanaNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery || limit <= 0) return [];

  const exact: TanaNode[] = [];
  const prefix: TanaNode[] = [];
  const contains: TanaNode[] = [];

  for (const node of index.nodesById.values()) {
    // Field occurrences and Value Nodes contribute semantic text to their
    // canonical Host result. They are never independent global-search rows.
    if (
      node.semanticTypes.includes('field') ||
      node.semanticTypes.includes('value')
    ) {
      continue;
    }

    const owner = getTanaProjectionTarget(index, node.id);
    if (!owner) continue;
    const text = resolveTanaNodeTitle(index, owner.id).toLocaleLowerCase();
    const semanticText = [
      ...owner.supertagIds.map((id) => index.nodesById.get(id)?.text ?? ''),
      ...(index.fieldNodesByParent.get(owner.id) ?? []).flatMap((field) => [
        index.nodesById.get(field.fieldId)?.text ?? '',
        ...field.valueNodeIds.map((valueNodeId) =>
          index.nodesById.get(valueNodeId)?.text ?? ''
        ),
        ...field.values.map((value) => value.type === 'options' || value.type === 'from-supertag'
          ? index.nodesById.get(value.value)?.text ?? '' : String(value.value)),
      ]),
    ].join(' ').toLocaleLowerCase();

    if (text === normalizedQuery) {
      exact.push(node);
    } else if (text.startsWith(normalizedQuery)) {
      prefix.push(node);
    } else if (text.includes(normalizedQuery) || semanticText.includes(normalizedQuery)) {
      contains.push(node);
    }
  }

  return [...exact, ...prefix, ...contains].slice(0, limit);
}
