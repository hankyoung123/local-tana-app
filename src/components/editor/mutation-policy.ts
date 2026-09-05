import { TogglePlugin } from '@platejs/toggle/react';
import type { Path, TElement } from 'platejs';
import type { PlateEditor } from 'platejs/react';
import { isTanaNodeInteractable } from '@/lib/tana/outliner';
import type { TanaNodeSemanticContext } from '@/lib/tana/node-semantic';
import { TanaZoomPlugin } from './plugins/tana-zoom-plugin';

/** Re-read Plate state at execution, never trust an earlier menu/selection check. */
export function canMutateTanaNode(editor: PlateEditor, path: Path,
  policy: (node: TElement, context: TanaNodeSemanticContext) => boolean): boolean {
  const node = editor.api.node<TElement>(path)?.[0];
  return !!node && isTanaNodeInteractable(editor.children, path,
    editor.getOptions(TogglePlugin).openIds ?? new Set<string>(),
    editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null) &&
    policy(node, { document: editor.children, path });
}
