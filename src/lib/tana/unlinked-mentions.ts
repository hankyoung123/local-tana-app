import type { Descendant, Path, TElement } from 'platejs';

import { KEYS, TextApi } from 'platejs';

import { TANA_SUPERTAG_KEY } from './constants';
import type { NodeId, TanaIndex } from './types';

export type TanaUnlinkedMention = {
  end: number;
  path: Path;
  sourceNodeId: NodeId;
  start: number;
  targetNodeId: NodeId;
};

function isInTrash(index: TanaIndex, nodeId: NodeId): boolean {
  const trashId = index.systemNodeIds.get('trash');
  const visited = new Set<NodeId>();
  let current: NodeId | undefined = nodeId;

  while (current && !visited.has(current)) {
    if (current === trashId) return true;
    visited.add(current);
    current = index.parentNodeIds.get(current);
  }

  return false;
}

function isActiveCanonicalNode(index: TanaIndex, nodeId: NodeId): boolean {
  const node = index.nodesById.get(nodeId);

  return !!node && !node.systemNode && !node.referenceTargetId && !isInTrash(index, nodeId);
}

function collectMatches(
  descendant: Descendant,
  path: Path,
  targetNodeId: NodeId,
  targetText: string,
  sourceNodeId: NodeId,
  results: TanaUnlinkedMention[]
): void {
  if (TextApi.isText(descendant)) {
    const text = descendant.text;
    const normalizedText = text.toLocaleLowerCase();
    const normalizedTarget = targetText.toLocaleLowerCase();
    let start = normalizedText.indexOf(normalizedTarget);

    while (start >= 0) {
      results.push({
        end: start + targetText.length,
        path,
        sourceNodeId,
        start,
        targetNodeId,
      });
      start = normalizedText.indexOf(normalizedTarget, start + targetText.length);
    }
    return;
  }

  const element = descendant as TElement;

  // A relation already has a canonical target. Do not offer nested text inside
  // Mention or Supertag presentation as an unlinked candidate.
  if (element.type === KEYS.mention || element.type === TANA_SUPERTAG_KEY) return;

  element.children.forEach((child, index) => {
    collectMatches(child, [...path, index], targetNodeId, targetText, sourceNodeId, results);
  });
}

/** A small derived scan for plain current-document mentions; nothing is indexed or persisted. */
export function findTanaUnlinkedMentions(
  index: TanaIndex,
  targetNodeId: NodeId
): readonly TanaUnlinkedMention[] {
  const target = index.nodesById.get(targetNodeId);
  const targetText = target?.text.trim();

  if (!targetText || !isActiveCanonicalNode(index, targetNodeId)) return [];

  const results: TanaUnlinkedMention[] = [];

  index.nodesById.forEach((source) => {
    if (
      source.id === targetNodeId ||
      !isActiveCanonicalNode(index, source.id) ||
      source.semanticTypes.includes('field') ||
      source.semanticTypes.includes('value')
    ) {
      return;
    }

    collectMatches(
      source.node as TElement,
      source.path,
      targetNodeId,
      targetText,
      source.id,
      results
    );
  });

  return results;
}
