import { getActiveSupertagInstances, isTanaNodeActive } from './index';
import { evaluateTanaQuery, type TanaQueryDiagnostic, type TanaQueryRunStatus } from './query';
import type { TanaIndex, TanaNode } from './types';

export type TanaViewSource = {
  diagnostics: readonly TanaQueryDiagnostic[];
  kind: 'children' | 'search' | 'supertag-instances';
  nodes: readonly TanaNode[];
  status: TanaQueryRunStatus | 'ok';
};

function getNode(index: TanaIndex, nodeId: string): TanaNode | undefined {
  return index.nodesById.get(nodeId);
}

/**
 * A direct child can be projected when it owns user-visible content or an
 * explicit presentation. Field/Value/Option nodes remain structural and are
 * rendered only through their owning Field UI.
 */
export function isTanaViewDisplayableChild(node: TanaNode): boolean {
  if (
    node.semanticTypes.includes('field') ||
    node.semanticTypes.includes('value') ||
    node.semanticTypes.includes('option')
  ) {
    return false;
  }

  return (
    node.semanticTypes.includes('content') ||
    node.semanticTypes.includes('reference') ||
    node.semanticTypes.includes('search') ||
    node.semanticTypes.includes('view')
  );
}

/**
 * Resolves the canonical Nodes shown by a View without storing any result
 * list. A Search owns its query, a Supertag Definition owns its instances,
 * and an ordinary View owns only the presentation of its direct content
 * children.
 */
export function resolveTanaCollectionSource(
  index: TanaIndex,
  view: TanaNode
): TanaViewSource {
  if (view.searchDefinition) {
    const result = evaluateTanaQuery(index, view.searchDefinition.query, {
      excludeNodeId: view.id,
      searchHostId: view.id,
    });
    return {
      diagnostics: result.diagnostics,
      kind: 'search',
      nodes: result.nodes,
      status: result.status,
    };
  }

  if (view.supertagDefinition) {
    return {
      diagnostics: [],
      kind: 'supertag-instances',
      nodes: getActiveSupertagInstances(index, view.id).filter(
        ({ id }) => id !== view.id
      ),
      status: 'ok',
    };
  }

  return {
    diagnostics: [],
    kind: 'children',
    nodes: (index.childrenByParent.get(view.id) ?? [])
      .map((nodeId) => getNode(index, nodeId))
      .filter(
        (node): node is TanaNode =>
          !!node &&
          isTanaNodeActive(index, node.id) &&
          isTanaViewDisplayableChild(node)
      ),
    status: 'ok',
  };
}
