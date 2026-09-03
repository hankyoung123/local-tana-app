import type { Value } from 'platejs';

import type { NodeId, TanaSystemNode, TanaIndex } from './types';

export const WORKSPACE_SYSTEM_NODE: TanaSystemNode = 'workspace';

export const WORKSPACE_DIRECT_CHILD_SYSTEM_NODES: readonly TanaSystemNode[] = [
  'home',
  'daily-notes',
  'schema',
  'library',
  'settings',
  'trash',
];

export const CANONICAL_SYSTEM_NODES: readonly TanaSystemNode[] = [
  WORKSPACE_SYSTEM_NODE,
  ...WORKSPACE_DIRECT_CHILD_SYSTEM_NODES,
];

/**
 * Validates the canonical workspace skeleton without introducing a new
 * hierarchy truth. Parent/children remain derived from document order +
 * flat indent (via the passed index); this only checks:
 *
 * - exactly 1 workspace + exactly 1 of each of the six system children
 * - parent(home/daily-notes/schema/library/settings/trash) = workspace
 *
 * It never validates title text and never relies on NodeId strings such as
 * `id === 'schema'` — only the `tanaSystemNode` marker counts.
 */
export function validateWorkspaceStructure(
  document: Value,
  index: Pick<TanaIndex, 'parentNodeIds'>
): boolean {
  const counts = new Map<TanaSystemNode, number>();
  const ids = new Map<TanaSystemNode, NodeId>();

  for (const descendant of document) {
    if (!descendant || typeof descendant !== 'object') continue;
    if (!('children' in descendant) || !Array.isArray(descendant.children)) {
      continue;
    }

    const marker = (descendant as { tanaSystemNode?: unknown }).tanaSystemNode;

    if (marker === undefined) continue;
    if (typeof marker !== 'string') return false;

    const systemNode = marker as TanaSystemNode;

    if (!CANONICAL_SYSTEM_NODES.includes(systemNode)) return false;

    const id = (descendant as { id?: unknown }).id;

    if (typeof id !== 'string' || id.length === 0) return false;

    counts.set(systemNode, (counts.get(systemNode) ?? 0) + 1);
    if (!ids.has(systemNode)) ids.set(systemNode, id);
  }

  for (const systemNode of CANONICAL_SYSTEM_NODES) {
    if (counts.get(systemNode) !== 1) return false;
  }

  const workspaceId = ids.get(WORKSPACE_SYSTEM_NODE);

  if (!workspaceId) return false;

  // Workspace is the single root; it must not be nested under another Node.
  if (index.parentNodeIds.get(workspaceId) !== undefined) return false;

  for (const child of WORKSPACE_DIRECT_CHILD_SYSTEM_NODES) {
    const childId = ids.get(child);

    if (!childId) return false;
    if (index.parentNodeIds.get(childId) !== workspaceId) return false;
  }

  return true;
}
