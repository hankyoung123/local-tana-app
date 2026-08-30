import type { PlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { ElementApi } from 'platejs';

import { isTanaNodeElement } from './constants';
import { getTanaAncestorPaths } from './outliner';
import type { NodeId } from './types';

/**
 * Opens only the target's indent ancestors through Plate Toggle's existing
 * `openIds`. The document and node presentation stay untouched.
 */
export function revealTanaNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = editor.api.node({ at: [], id: targetNodeId });

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  if (
    !ElementApi.isElement(targetNode) ||
    !isTanaNodeElement(targetNode, targetPath)
  ) {
    return false;
  }

  const ancestorIds = getTanaAncestorPaths(editor.children, targetPath).flatMap(
    (path) => {
      const ancestor = editor.api.node(path)?.[0];
      const id = ancestor && 'id' in ancestor ? ancestor.id : undefined;

      return typeof id === 'string' ? [id] : [];
    }
  );

  if (ancestorIds.length > 0) {
    editor.getApi(TogglePlugin).toggle.toggleIds(ancestorIds, true);
  }

  return true;
}

/** Focuses a NodeId using Plate APIs, revealing collapsed ancestors first. */
export function navigateToNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = editor.api.node({ at: [], id: targetNodeId });

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  if (
    !ElementApi.isElement(targetNode) ||
    !isTanaNodeElement(targetNode, targetPath)
  ) {
    return false;
  }

  revealTanaNode(editor, targetNodeId);

  editor.tf.select(targetPath);
  editor.tf.focus();

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      editor.api.toDOMNode(targetNode)?.scrollIntoView({
      behavior: 'smooth',
        block: 'center',
      });
    });
  }

  return true;
}
