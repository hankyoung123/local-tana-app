import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import type { NodeId } from './types';

function getIndent(element: TElement): number {
  return typeof element.indent === 'number' ? element.indent : 0;
}

function isElement(value: Value[number]): value is TElement {
  return 'children' in value && Array.isArray(value.children);
}

function getTanaNodeAt(document: Value, path: Path): TElement | undefined {
  if (path.length !== 1) return;

  const node = document[path[0]];

  return isElement(node) && isTanaNodeElement(node, path) ? node : undefined;
}

/** Returns every top-level Plate block that participates in the outliner. */
export function getTanaNodePaths(document: Value): Path[] {
  return document.flatMap((node, index) =>
    isElement(node) && isTanaNodeElement(node, [index]) ? [[index]] : []
  );
}

/** Resolves a NodeId inside the source document without creating a node copy. */
export function getTanaNodePath(
  document: Value,
  nodeId: NodeId
): Path | undefined {
  return getTanaNodePaths(document).find(
    (path) => getTanaNodeAt(document, path)?.id === nodeId
  );
}

/** Returns the closest shallower top-level outliner node, if one exists. */
export function getTanaParentPath(
  document: Value,
  path: Path
): Path | undefined {
  const node = getTanaNodeAt(document, path);

  if (!node) return;

  const nodeIndent = getIndent(node);

  for (let index = path[0] - 1; index >= 0; index -= 1) {
    const candidate = document[index];

    if (!isElement(candidate) || !isTanaNodeElement(candidate, [index])) {
      continue;
    }
    if (getIndent(candidate) < nodeIndent) return [index];
  }
}

/** Returns the flat-indent ancestor chain from workspace root to parent. */
export function getTanaAncestorPaths(document: Value, path: Path): Path[] {
  const ancestors: Path[] = [];
  let parentPath = getTanaParentPath(document, path);

  while (parentPath) {
    ancestors.unshift(parentPath);
    parentPath = getTanaParentPath(document, parentPath);
  }

  return ancestors;
}

/** Returns the contiguous flat-indent subtree owned by a top-level Tana node. */
export function getTanaNodeDescendantPaths(
  document: Value,
  path: Path
): Path[] {
  const node = getTanaNodeAt(document, path);

  if (!node) return [];

  const descendants: Path[] = [];
  const nodeIndent = getIndent(node);

  for (let index = path[0] + 1; index < document.length; index += 1) {
    const candidate = document[index];

    if (!isElement(candidate) || !isTanaNodeElement(candidate, [index])) {
      continue;
    }
    if (getIndent(candidate) <= nodeIndent) break;

    descendants.push([index]);
  }

  return descendants;
}

/**
 * Derives the visual Zoom range from the single focused NodeId. The returned
 * paths always point into the unchanged Plate document; this never creates a
 * filtered editor value or projection document.
 */
export function getTanaZoomRange(
  document: Value,
  focusedNodeId: NodeId | null
): Path[] {
  const allNodePaths = getTanaNodePaths(document);

  if (!focusedNodeId) return allNodePaths;

  const focusedPath = getTanaNodePath(document, focusedNodeId);

  return focusedPath
    ? [focusedPath, ...getTanaNodeDescendantPaths(document, focusedPath)]
    : allNodePaths;
}

/** Whether a Node remains in the current, purely derived Zoom range. */
export function isTanaNodeInZoomRange(
  document: Value,
  path: Path,
  focusedNodeId: NodeId | null
): boolean {
  return getTanaZoomRange(document, focusedNodeId).some(
    (zoomPath) => zoomPath[0] === path[0]
  );
}

/** A node owns children when the following flat outliner block is indented. */
export function hasTanaNodeDescendants(document: Value, path: Path): boolean {
  return getTanaNodeDescendantPaths(document, path).length > 0;
}

/** Finds top-level Tana nodes that own a nested outliner subtree. */
export function getTanaParentPaths(document: Value): Path[] {
  return document.flatMap((node, index) =>
    isElement(node) &&
    isTanaNodeElement(node, [index]) &&
    hasTanaNodeDescendants(document, [index])
      ? [[index]]
      : []
  );
}

/** Stable IDs for the current parent nodes, used only to initialize openIds. */
export function getTanaParentNodeIds(document: Value): string[] {
  return getTanaParentPaths(document).flatMap((path) => {
    const id = getTanaNodeAt(document, path)?.id;

    return typeof id === 'string' ? [id] : [];
  });
}

/** Collapse is UI behavior: a parent is collapsed when its ID is not open. */
export function isTanaNodeCollapsed(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>
): boolean {
  const node = getTanaNodeAt(document, path);

  return (
    !!node &&
    typeof node.id === 'string' &&
    hasTanaNodeDescendants(document, path) &&
    !openIds.has(node.id)
  );
}

/** A node is hidden when any of its flat-indent ancestors is collapsed. */
export function isTanaNodeHidden(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>
): boolean {
  let parentPath = getTanaParentPath(document, path);

  while (parentPath) {
    if (isTanaNodeCollapsed(document, parentPath, openIds)) return true;

    parentPath = getTanaParentPath(document, parentPath);
  }

  return false;
}

/**
 * The one interaction boundary for the outliner: a top-level Tana node that
 * is neither concealed by a collapsed ancestor nor outside the derived Zoom
 * range. `null` represents the workspace root and keeps every Tana Node in
 * range.
 */
export function isTanaNodeInteractable(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>,
  focusedNodeId: NodeId | null = null
): boolean {
  return (
    !!getTanaNodeAt(document, path) &&
    !isTanaNodeHidden(document, path, openIds) &&
    isTanaNodeInZoomRange(document, path, focusedNodeId)
  );
}
