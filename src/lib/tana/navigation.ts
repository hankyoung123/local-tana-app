import type { PlateEditor } from 'platejs/react';

import {
  focusTanaNode,
  revealTanaNode,
  zoomOutTanaNode,
  zoomToTanaNode,
  zoomToTanaWorkspaceRoot,
} from './zoom';
import type { NodeId } from './types';

/** All NodeId navigation enters the one Plate-owned Zoom state. */
export function navigateToNode(editor: PlateEditor, targetNodeId: NodeId) {
  return zoomToTanaNode(editor, targetNodeId);
}

export {
  focusTanaNode,
  revealTanaNode,
  zoomOutTanaNode,
  zoomToTanaNode,
  zoomToTanaWorkspaceRoot,
};
