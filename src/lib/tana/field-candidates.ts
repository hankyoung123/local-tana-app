import type { NodeId, TanaIndex, TanaNode, TanaQueryExpression } from './types';

type SearchRunner = (index: TanaIndex, expression: TanaQueryExpression) => TanaNode[];

function isInTrash(index: TanaIndex, nodeId: NodeId): boolean {
  const trashId = index.systemNodeIds.get('trash');
  const seen = new Set<NodeId>();
  let current: NodeId | undefined = nodeId;
  while (trashId && current && !seen.has(current)) {
    if (current === trashId) return true;
    seen.add(current);
    current = index.parentNodeIds.get(current);
  }
  return false;
}

function target(index: TanaIndex, nodeId: NodeId): TanaNode | undefined {
  const source = index.nodesById.get(nodeId);
  if (!source || source.systemNode || isInTrash(index, nodeId)) return;
  if (!source.referenceTargetId) return source;
  const resolved = index.nodesById.get(source.referenceTargetId);
  return resolved && !resolved.referenceTargetId && !resolved.systemNode && !isInTrash(index, resolved.id)
    ? resolved
    : undefined;
}

/** Pure ordered candidate projection shared by controls and validation. */
export function resolveFieldValueCandidates(
  index: TanaIndex,
  fieldId: NodeId,
  runSearch: SearchRunner
): TanaNode[] {
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;
  if (!definition) return [];
  const result: TanaNode[] = [];
  const seen = new Set<NodeId>();
  const add = (id: NodeId) => {
    const candidate = target(index, id);
    if (candidate && !seen.has(candidate.id)) {
      seen.add(candidate.id);
      result.push(candidate);
    }
  };
  if (definition.type === 'options') {
    for (const sourceId of index.childrenByParent.get(fieldId) ?? []) {
      const source = index.nodesById.get(sourceId);
      if (!source) continue;
      if (source.referenceTargetId) {
        const resolved = target(index, source.id);
        (resolved ? index.childrenByParent.get(resolved.id) ?? [] : []).forEach(add);
      } else if (source.searchDefinition) {
        try { runSearch(index, source.searchDefinition.query).forEach((node) => add(node.id)); } catch {}
      } else add(source.id);
    }
  } else if (definition.type === 'from-supertag' && definition.sourceSupertagId) {
    (index.nodesBySupertag.get(definition.sourceSupertagId) ?? []).forEach(add);
  }
  return result;
}
