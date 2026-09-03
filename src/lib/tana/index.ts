import type { Descendant, Path, TElement, Value } from 'platejs';

import { ElementApi, KEYS, TextApi } from 'platejs';

import { isTanaNodeElement, TANA_SUPERTAG_KEY } from './constants';
import {
  getNodeSemanticType,
  getNodeSemanticTypes,
  hasNodeSemantic,
} from './node-semantic';
import { getTanaDirectChildPaths, getTanaParentPath } from './outliner';
import type {
  FieldId,
  FieldValue,
  NodeId,
  ReferenceRelation,
  SupertagDefinition,
  TanaBlockElement,
  TanaFieldNode,
  TanaIndex,
  TanaNode,
} from './types';

type MentionElement = TElement & {
  key?: unknown;
};

export type NodeReferenceCandidate = Pick<TanaNode, 'id' | 'text'>;
export type SupertagCandidate = NodeReferenceCandidate & {
  definition: SupertagDefinition;
};

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
 * Reads a typed Field value from its ordinary value Node. A changed Field
 * Definition never mutates that Node: the type marker simply makes the old
 * value unset for the new Field type.
 */
function getFieldValueFromNode(
  definition: TanaBlockElement['tanaFieldDefinition'],
  valueNode: TanaNode | undefined
): FieldValue | undefined {
  if (!definition || !valueNode) return;

  const valueElement = valueNode.node as TanaBlockElement;

  if (valueElement.tanaFieldValueType !== definition.type) return;

  const text = getRawElementText(valueElement);

  if (definition.type === 'plain') {
    return text.length > 0 ? { type: 'plain', value: text } : undefined;
  }

  if (definition.type === 'date') {
    return text.length > 0 ? { type: 'date', value: text } : undefined;
  }

  if (definition.type === 'number') {
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

  if (definition.type === 'checkbox') {
    if (text === 'true') return { type: 'checkbox', value: true };
    if (text === 'false') return { type: 'checkbox', value: false };

    return;
  }

  const targetNodeId = findMentionTarget(valueElement);

  if (!targetNodeId) return;

  return definition.type === 'options'
    ? { type: 'options', value: targetNodeId }
    : { type: 'from-supertag', value: targetNodeId };
}

function isDerivedFieldValueValid(
  document: Value,
  fieldId: NodeId,
  definition: NonNullable<TanaBlockElement['tanaFieldDefinition']>,
  value: FieldValue,
  nodesById: ReadonlyMap<NodeId, TanaNode>,
  nodesBySupertag: ReadonlyMap<NodeId, readonly NodeId[]>
): boolean {
  if (definition.type !== value.type) return false;

  if (definition.type === 'options' && value.type === 'options') {
    const fieldDefinitionNode = nodesById.get(fieldId);

    return !!fieldDefinitionNode && getTanaDirectChildPaths(document, fieldDefinitionNode.path)
      .some((path) => {
        const candidate = document[path[0]];

        return ElementApi.isElement(candidate) && candidate.id === value.value;
      });
  }

  if (definition.type === 'from-supertag' && value.type === 'from-supertag') {
    return (
      definition.sourceSupertagId !== null &&
      (nodesBySupertag.get(definition.sourceSupertagId)?.includes(value.value) ??
        false)
    );
  }

  return true;
}

/** Fully derives the read-only semantic index from the current Plate value. */
export function buildTanaIndex(document: Value): TanaIndex {
  const nodesById = new Map<NodeId, TanaNode>();
  const backlinks = new Map<NodeId, ReferenceRelation[]>();
  const references: ReferenceRelation[] = [];
  const referenceTargetsByNode = new Map<NodeId, NodeId>();
  const nodesBySupertag = new Map<NodeId, NodeId[]>();
  const fieldNodesById = new Map<NodeId, TanaFieldNode>();
  const fieldNodesByParent = new Map<NodeId, TanaFieldNode[]>();
  const fieldValues = new Map<NodeId, Map<FieldId, FieldValue>>();
  const orderedNodes: TanaNode[] = [];

  document.forEach((descendant, index) => {
    const path = [index];

    if (!isElement(descendant) || !isTanaNodeElement(descendant, path)) return;
    if (typeof descendant.id !== 'string' || descendant.id.length === 0) return;

    const tanaNode = descendant as TanaBlockElement;
    const semanticContext = { document, path };
    const node: TanaNode = {
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

        if (child.type === KEYS.mention || child.type === TANA_SUPERTAG_KEY) {
          const targetNodeId = getReferenceTargetByKey(child);
          const targetName = targetNodeId
            ? resolveNodeName(targetNodeId, resolving)
            : '';

          return `${child.type === KEYS.mention ? '@' : '#'}${targetName}`;
        }

        return getElementText(child, resolving);
      })
      .join('');
  }

  orderedNodes.forEach((node) => {
    nodesById.set(node.id, {
      ...node,
      text: resolveNodeName(node.id, new Set()),
    });
  });

  const resolvedNodes = orderedNodes.flatMap((node) => {
    const resolved = nodesById.get(node.id);

    return resolved ? [resolved] : [];
  });
  const nodeIdsByDocumentIndex = new Map(
    resolvedNodes.map((node) => [node.path[0], node.id])
  );

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

    if (
      descendant.type === TANA_SUPERTAG_KEY &&
      typeof (descendant as MentionElement).key === 'string'
    ) {
      const supertagId = (descendant as MentionElement).key as NodeId;
      const taggedNodes = nodesBySupertag.get(supertagId) ?? [];

      if (!taggedNodes.includes(sourceNodeId)) {
        taggedNodes.push(sourceNodeId);
        nodesBySupertag.set(supertagId, taggedNodes);
      }
    }

    if (targetNodeId) {
      addReference({ kind: 'inline', path, sourceNodeId, targetNodeId });
    }

    descendant.children.forEach((child, index) => {
      visitSemanticChild(child, [...path, index], sourceNodeId);
    });
  }

  resolvedNodes.forEach((node) => {
    if (node.referenceTargetId && nodesById.has(node.referenceTargetId)) {
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
      })
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
    const values = definition
      ? valueNodes.flatMap((valueNode) => {
          const parsedValue = getFieldValueFromNode(definition, valueNode);

          return parsedValue &&
            isDerivedFieldValueValid(
              document,
              fieldId,
              definition,
              parsedValue,
              nodesById,
              nodesBySupertag
            )
            ? [parsedValue]
            : [];
        })
      : [];
    const cardinality = definition?.cardinality ?? 'single';
    const valueNode = valueNodes[0];
    const value = cardinality === 'single' ? values[0] : undefined;
    const fieldNode: TanaFieldNode = {
      brokenFieldDefinition: !definition,
      fieldId,
      id: node.id,
      node: node.node as TanaBlockElement,
      parentNodeId,
      path: node.path,
      value,
      valueNodeId: valueNode?.id,
      valueNodeIds: valueNodes.map((valueNode) => valueNode.id),
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
    document,
    fieldNodesById,
    fieldNodesByParent,
    fieldValues,
    nodesById,
    nodesBySupertag,
    references,
    referenceTargetsByNode,
  };
}

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
        node.semanticTypes.includes('supertag-definition') && node.text.length > 0
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
  return Array.from(index.nodesBySupertag.entries())
    .filter(([, nodeIds]) => nodeIds.includes(nodeId))
    .map(([supertagId]) => supertagId);
}

export function getNodeReferenceCandidatesFromIndex(
  index: TanaIndex
): NodeReferenceCandidate[] {
  return Array.from(index.nodesById.values())
    .filter(({ text }) => text.length > 0)
    .map(({ id, text }) => ({ id, text }));
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
    const text = node.text.toLocaleLowerCase();

    if (text === normalizedQuery) {
      exact.push(node);
    } else if (text.startsWith(normalizedQuery)) {
      prefix.push(node);
    } else if (text.includes(normalizedQuery)) {
      contains.push(node);
    }
  }

  return [...exact, ...prefix, ...contains].slice(0, limit);
}
