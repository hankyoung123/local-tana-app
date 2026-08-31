import type { Descendant, Path, TElement, Value } from 'platejs';

import { KEYS, TextApi } from 'platejs';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from './constants';
import type {
  FieldId,
  FieldValueState,
  NodeId,
  ReferenceRelation,
  SupertagDefinition,
  TanaBlockElement,
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

  if (typeof key === 'string') {
    return key;
  }
}

/** Fully derives the read-only semantic index from the current Plate value. */
export function buildTanaIndex(document: Value): TanaIndex {
  const nodesById = new Map<NodeId, TanaNode>();
  const backlinks = new Map<NodeId, ReferenceRelation[]>();
  const nodesBySupertag = new Map<NodeId, NodeId[]>();
  const fieldValues = new Map<NodeId, ReadonlyMap<FieldId, FieldValueState>>();

  document.forEach((descendant, index) => {
    const path = [index];

    if (!isElement(descendant) || !isTanaNodeElement(descendant, path)) return;
    if (typeof descendant.id !== 'string' || descendant.id.length === 0) return;

    const tanaNode = descendant as TanaBlockElement;

    nodesById.set(descendant.id, {
      fieldValues: tanaNode.tanaFieldValues,
      fieldDefinition: tanaNode.tanaFieldDefinition,
      id: descendant.id,
      node: descendant,
      path,
      supertagDefinition: tanaNode.tanaSupertagDefinition,
      text: '',
      viewDefinition: tanaNode.tanaViewDefinition,
    });

    if (tanaNode.tanaFieldValues) {
      fieldValues.set(
        descendant.id,
        new Map(Object.entries(tanaNode.tanaFieldValues))
      );
    }
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

  nodesById.forEach((node, nodeId) => {
    nodesById.set(nodeId, {
      ...node,
      text: resolveNodeName(nodeId, new Set()),
    });
  });

  function visitSemanticChild(
    descendant: Descendant,
    path: Path,
    sourceNodeId: NodeId
  ): void {
    if (!isElement(descendant)) return;

    const targetNodeId = getReferenceTarget(descendant);

    if (
      descendant.type === TANA_SUPERTAG_KEY &&
      sourceNodeId &&
      typeof (descendant as MentionElement).key === 'string'
    ) {
      const supertagId = (descendant as MentionElement).key as NodeId;
      const taggedNodes = nodesBySupertag.get(supertagId) ?? [];

      if (!taggedNodes.includes(sourceNodeId)) {
        taggedNodes.push(sourceNodeId);
        nodesBySupertag.set(supertagId, taggedNodes);
      }
    }

    if (targetNodeId && sourceNodeId) {
      const relations = backlinks.get(targetNodeId) ?? [];

      relations.push({ path, sourceNodeId, targetNodeId });
      backlinks.set(targetNodeId, relations);
    }

    descendant.children.forEach((child, index) => {
      visitSemanticChild(child, [...path, index], sourceNodeId);
    });
  }

  nodesById.forEach((node) => {
    node.node.children.forEach((child, index) => {
      visitSemanticChild(child, [...node.path, index], node.id);
    });
  });

  return {
    backlinks,
    fieldValues,
    nodesById,
    nodesBySupertag,
  };
}

function getReferenceTargetByKey(element: TElement): NodeId | undefined {
  const key = (element as MentionElement).key;

  return typeof key === 'string' ? key : undefined;
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
        !!node.supertagDefinition && node.text.length > 0
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
