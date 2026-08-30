import type { Path, TElement, Value } from 'platejs';

import { isTanaNodeElement } from './constants';

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
 * is not concealed by a collapsed ancestor.
 */
export function isTanaNodeInteractable(
  document: Value,
  path: Path,
  openIds: ReadonlySet<string>
): boolean {
  return (
    !!getTanaNodeAt(document, path) &&
    !isTanaNodeHidden(document, path, openIds)
  );
}
