import type { PlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { isTanaNodeInteractable } from './outliner';
import type { NodeId } from './types';

const EMPTY_OPEN_IDS = new Set<string>();

export function navigateToNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = editor.api.node({ at: [], id: targetNodeId });

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  if (
    !isTanaNodeInteractable(
      editor.children,
      targetPath,
      editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS
    )
  ) {
    return false;
  }

  editor.tf.select(targetPath);
  editor.tf.focus();

  requestAnimationFrame(() => {
    editor.api.toDOMNode(targetNode)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  });

  return true;
}
