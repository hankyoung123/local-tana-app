import type { PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from './constants';
import type { NodeId } from './types';

export function navigateToNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = editor.api.node({ at: [], id: targetNodeId });

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  if (!isTanaNodeElement(targetEntry)) return false;

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
