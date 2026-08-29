import type { Descendant, Path, TElement, Value } from 'platejs';

import { KEYS, TextApi } from 'platejs';

import { TANA_SUPERTAG_KEY } from './constants';
import type {
  FieldId,
  FieldValue,
  NodeId,
  ReferenceRelation,
  SupertagDefinition,
  TanaBlockElement,
  TanaIndex,
  TanaNode,
} from './types';

type MentionElement = TElement & {
  key?: unknown;
  value?: unknown;
};

export type NodeReferenceCandidate = Pick<TanaNode, 'id' | 'text'>;
export type SupertagCandidate = NodeReferenceCandidate & {
  definition: SupertagDefinition;
};

function isElement(node: Descendant): node is TElement {
  return 'children' in node && Array.isArray(node.children);
}

function getElementText(element: TElement): string {
  return element.children
    .map((child) => {
      if (TextApi.isText(child)) return child.text;

      if (child.type === KEYS.mention) {
        const value = (child as MentionElement).value;

        return typeof value === 'string' ? `@${value}` : '';
      }

      if (child.type === TANA_SUPERTAG_KEY) {
        const value = (child as MentionElement).value;

        return typeof value === 'string' ? `#${value}` : '';
      }

      return getElementText(child);
    })
    .join('')
    .trim();
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
  const fieldValues = new Map<NodeId, ReadonlyMap<FieldId, FieldValue>>();

  function visit(
    descendant: Descendant,
    path: Path,
    sourceNodeId?: NodeId
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

    const nodeId =
      typeof descendant.id === 'string' ? descendant.id : undefined;
    const nextSourceNodeId = targetNodeId ? sourceNodeId : nodeId ?? sourceNodeId;

    if (nodeId && !targetNodeId) {
      const tanaNode = descendant as TanaBlockElement;

      nodesById.set(nodeId, {
        fieldValues: tanaNode.tanaFieldValues,
        id: nodeId,
        node: descendant,
        path,
        supertagDefinition: tanaNode.tanaSupertagDefinition,
        text: getElementText(descendant),
        viewDefinition: tanaNode.tanaViewDefinition,
      });

      if (tanaNode.tanaFieldValues) {
        fieldValues.set(nodeId, new Map(Object.entries(tanaNode.tanaFieldValues)));
      }
    }

    descendant.children.forEach((child, index) => {
      visit(child, [...path, index], nextSourceNodeId);
    });
  }

  document.forEach((node, index) => visit(node, [index]));

  return {
    backlinks,
    fieldValues,
    nodesById,
    nodesBySupertag,
  };
}

export function getSupertagCandidates(document: Value): SupertagCandidate[] {
  return Array.from(buildTanaIndex(document).nodesById.values())
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

export function getNodeReferenceCandidates(
  document: Value
): NodeReferenceCandidate[] {
  return Array.from(buildTanaIndex(document).nodesById.values())
    .filter(({ text }) => text.length > 0)
    .map(({ id, text }) => ({ id, text }));
}
