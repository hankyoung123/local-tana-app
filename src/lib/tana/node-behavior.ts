import type { TElement } from 'platejs';

import { isTanaFieldHostNode } from './fields';
import {
  getNodeSemanticTypes,
  type TanaNodeSemanticContext,
} from './node-semantic';
import { getTanaParentPath } from './outliner';

function getElementAtPath(
  document: NonNullable<TanaNodeSemanticContext['document']>,
  path: NonNullable<TanaNodeSemanticContext['path']>
): TElement | undefined {
  const node = document[path[0]];

  return node && 'children' in node && Array.isArray(node.children)
    ? (node as TElement)
    : undefined;
}

function hasFieldStructureAncestor(
  document: NonNullable<TanaNodeSemanticContext['document']>,
  path: NonNullable<TanaNodeSemanticContext['path']>
): boolean {
  let parentPath = getTanaParentPath(document, path);

  while (parentPath) {
    const parent = getElementAtPath(document, parentPath);

    if (
      parent &&
      getNodeSemanticTypes(parent, { document, path: parentPath }).some(
        (semantic) => semantic === 'field' || semantic === 'value'
      )
    ) {
      return true;
    }

    parentPath = getTanaParentPath(document, parentPath);
  }

  return false;
}

/**
 * Tana-specific policy for Plate's existing drag, drop, and navigation APIs.
 * The policy is deliberately small: Plate still owns the interaction
 * lifecycle, selection, keyboard behavior, and DOM handling.
 */
export function canDrag(
  node: TElement,
  context: TanaNodeSemanticContext = {}
): boolean {
  return (
    (node as TElement & { tanaSystemNode?: unknown }).tanaSystemNode === undefined &&
    !getNodeSemanticTypes(node, context).includes('value')
  );
}

export function canDrop(
  node: TElement,
  target: TElement,
  context: TanaNodeSemanticContext = {},
  targetContext: TanaNodeSemanticContext = {}
): boolean {
  const sourceTypes = getNodeSemanticTypes(node, context);
  const targetTypes = getNodeSemanticTypes(target, targetContext);

  // A Value Node is inseparable from its Field occurrence. The DnD adapter
  // separately verifies that a Field drag carries its complete subtree.
  if (sourceTypes.includes('value')) return false;

  // Nothing may be dropped into an existing Field/Value structure or a
  // Field Definition Node. Field candidates are direct children of their
  // Definition and are not valid Field hosts.
  if (
    targetTypes.includes('field') ||
    targetTypes.includes('value') ||
    targetTypes.includes('field-definition')
  ) {
    return false;
  }

  if (targetContext.document && targetContext.path) {
    const targetParentPath = getTanaParentPath(
      targetContext.document,
      targetContext.path
    );
    const targetParent = targetParentPath
      ? getElementAtPath(targetContext.document, targetParentPath)
      : undefined;

    if (
      hasFieldStructureAncestor(targetContext.document, targetContext.path) ||
      (sourceTypes.includes('field') &&
        targetParent &&
        getNodeSemanticTypes(targetParent, {
          document: targetContext.document,
          path: targetParentPath!,
        }).includes('field-definition'))
    ) {
      return false;
    }
  }

  if (sourceTypes.includes('field')) {
    return (
      !!targetContext.document &&
      !!targetContext.path &&
      isTanaFieldHostNode(targetContext.document, targetContext.path)
    );
  }

  return true;
}

/** Inline Mention navigation remains a Plate behavior, not a Tana Node type. */
export function canNavigate(node: TElement): boolean {
  return typeof (node as TElement & { key?: unknown }).key === 'string';
}
