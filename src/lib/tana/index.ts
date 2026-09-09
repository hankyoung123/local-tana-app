import { resolveTanaNodeTitle } from './title';
import type { Descendant, Path, TElement, Value } from 'platejs';

import { ElementApi, KEYS, TextApi } from 'platejs';

import { isTanaNodeElement, TANA_SUPERTAG_KEY } from './constants';
import { getFieldValueValidationIssues } from './field-value';
import {
  getNodeSemanticType,
  getNodeSemanticTypes,
  hasNodeSemantic,
} from './node-semantic';
import { getTanaDirectChildPaths, getTanaParentPath } from './outliner';
import { getTanaTimeKey } from './time';
import type {
  FieldId,
  FieldValidationIssue,
  FieldValue,
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
  | { status: 'missing' | 'trashed-or-unavailable' };

/** Resolves a definition's ancestors in parent-first order without recursion loops. */
export function getSupertagInheritance(
  index: Pick<TanaIndex, 'nodesById'>,
  supertagId: NodeId
): NodeId[] {
  const ordered: NodeId[] = [];
  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (id: NodeId, includeSelf: boolean) => {
    if (visited.has(id) || visiting.has(id)) return;

    const node = index.nodesById.get(id);

    if (!node?.supertagDefinition) return;

    visiting.add(id);
    const parents = node.supertagDefinition.extends ?? [];

    parents.forEach((parentId) => {
      if (typeof parentId === 'string') visit(parentId, true);
    });
    visiting.delete(id);
    visited.add(id);

    if (includeSelf) ordered.push(id);
  };

  visit(supertagId, false);

  return ordered;
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

function getDerivedFieldCandidateIds(
  document: Value,
  fieldId: NodeId,
  definition: NonNullable<TanaBlockElement['tanaFieldDefinition']>,
  nodesById: ReadonlyMap<NodeId, TanaNode>,
  nodesBySupertag: ReadonlyMap<NodeId, readonly NodeId[]>
): ReadonlySet<NodeId> | undefined {
  if (definition.type === 'options') {
    const fieldDefinitionNode = nodesById.get(fieldId);

    return new Set(fieldDefinitionNode ? getTanaDirectChildPaths(document, fieldDefinitionNode.path)
      .flatMap((path) => {
        const candidate = document[path[0]];

        return ElementApi.isElement(candidate) && typeof candidate.id === 'string'
          ? [candidate.id]
          : [];
      }) : []);
  }

  if (definition.type === 'from-supertag') {
    return new Set(
      definition.sourceSupertagId
        ? nodesBySupertag.get(definition.sourceSupertagId) ?? []
        : []
    );
  }
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

  // Title expressions are display-only. Keep the canonical Plate text intact
  // so Field names, query input, and document transforms never depend on a
  // generated title.
  orderedNodes.forEach((node) => {
    const resolved = nodesById.get(node.id);

    if (!resolved) return;
    let titleExpression: string | undefined;

    resolved.supertagIds.forEach((supertagId) => {
      [...getSupertagInheritance({ nodesById }, supertagId), supertagId].forEach(
        (definitionId) => {
          const expression = nodesById.get(definitionId)?.supertagDefinition?.titleExpression;

          if (expression !== undefined) titleExpression = expression;
        }
      );
    });

    nodesById.set(node.id, { ...resolved, titleExpression });
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
    const candidateIds = definition
      ? getDerivedFieldCandidateIds(
          document,
          fieldId,
          definition,
          nodesById,
          nodesBySupertag
        )
      : undefined;
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

  return {
    backlinks,
    childrenByParent,
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
        node.text.length > 0
    )
    .map(({ id, text }) => ({ id, text }));
}

/**
 * Trash is a derived query scope, not persisted Node state. Keep its complete
 * subtree indexed so canonical references and backlinks remain resolvable.
 */
export function isTanaNodeInTrash(index: TanaIndex, nodeId: NodeId): boolean {
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
export function isTanaNodeActive(index: TanaIndex, nodeId: NodeId): boolean {
  const node = index.nodesById.get(nodeId);

  return (
    !!node && node.systemNode === undefined && !isTanaNodeInTrash(index, nodeId)
  );
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

  return target.referenceTargetId === undefined && isTanaNodeActive(index, target.id)
    ? { status: 'live', target }
    : { status: 'trashed-or-unavailable' };
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
  return (index.nodesBySupertag.get(supertagId) ?? []).flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node && isTanaNodeActive(index, node.id) ? [node] : [];
  });
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
