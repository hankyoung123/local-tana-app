import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';
import { getTanaNodeDescendantPaths, getTanaAncestorPaths, hasTanaNodeDescendants } from '@/lib/tana/outliner';
import { canSelect } from '@/lib/tana/node-behavior';
import { canMutateTanaNode } from '../mutation-policy';
import { TanaNodeIdentityPlugin } from './tana-node-identity-plugin';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';

function current(editor: PlateEditor) {
  const path = editor.selection && [editor.selection.anchor.path[0]];
  if (!path || !canMutateTanaNode(editor, path, canSelect)) return;
  return editor.api.node(path);
}

/** Toggle's existing openIds are the only collapse state. */
export function setTanaScopeExpanded(editor: PlateEditor, expanded: boolean, all = false) {
  const entry = current(editor);
  const focusedId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
  const scope = focusedId
    ? editor.api.node({ at: [], id: focusedId })
    : editor.api.node({ at: [], match: node => node.tanaSystemNode === 'workspace' });
  const root = all ? scope : entry;
  if (!root) return false;
  const paths = [root[1], ...(all ? getTanaNodeDescendantPaths(editor.children, root[1]) : [])];
  const ids = paths.flatMap(path => {
    const node = editor.api.node(path)?.[0];
    if (!node || typeof node.id !== 'string' || !hasTanaNodeDescendants(editor.children, path)) return [];
    // Container roots stay open; their child trees are the editable scope.
    if (all && getTanaAncestorPaths(editor.children, path).some(ancestor =>
      ['trash', 'schema', 'settings'].includes(String(editor.api.node(ancestor)?.[0].tanaSystemNode)))) return [];
    if (node.tanaSystemNode !== undefined || (all && node.id === focusedId)) return [];
    return [node.id];
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(ids, expanded);
  if (!expanded && editor.selection) {
    const hiddenBy = getTanaAncestorPaths(editor.children, [editor.selection.anchor.path[0]])
      .find(path => ids.includes(String(editor.children[path[0]].id)));
    if (hiddenBy) editor.tf.select(editor.api.start(hiddenBy)!);
  }
  editor.getApi(TanaZoomPlugin).zoom.pruneBlockSelection();
  return true;
}

export const TanaShortcutsPlugin = createPlatePlugin({
  key: 'tanaShortcuts',
}).extendEditorTransforms(({ editor }) => ({
  tanaShortcuts: {
    collapseCurrentNode: () => setTanaScopeExpanded(editor, false),
    expandCurrentNode: () => setTanaScopeExpanded(editor, true),
    collapseAllWithinScope: () => setTanaScopeExpanded(editor, false, true),
    expandAllWithinScope: () => setTanaScopeExpanded(editor, true, true),
  },
})).configure({
  shortcuts: Object.fromEntries([
    ['shift+enter', 'after'], ['mod+shift+enter', 'before'],
    ['mod+enter', 'done'], [['mod+period', 'alt+right'], 'in'], [['mod+comma', 'alt+left'], 'out'],
    ['escape', 'menu'], ['mod+up', 'collapse'], ['mod+down', 'expand'],
    [['ctrl+meta+up', 'ctrl+alt+up'], 'collapseAll'],
    [['ctrl+meta+down', 'ctrl+alt+down'], 'expandAll'],
    ['mod+shift+up', 'up'], ['mod+shift+down', 'down'],
    ['mod+shift+backspace', 'trash'], ['mod+shift+d', 'duplicate'],
  ].map(([keys, action]) => [action, {
    keys, priority: 100,
    handler: ({ editor, event }: { editor: PlateEditor; event: KeyboardEvent }) => {
      if (event.isComposing || event.keyCode === 229) return false;
      // Native hotkeys can run before Slate's selectionchange flush. Resolve
      // the current DOM selection with Plate's official mapping before acting.
      const domSelection = event.view?.getSelection();
      const selection = domSelection && editor.api.toSlateRange(domSelection, { exactMatch: false, suppressThrow: true });
      if (selection) editor.tf.select(selection);
      const entry = current(editor);
      if (!entry || typeof entry[0].id !== 'string') return false;
      const id = entry[0].id;
      const commands = editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity;
      switch (action) {
        case 'before': commands.insertBefore(id); break;
        case 'after': commands.insertAfter(id); break;
        case 'in': editor.getTransforms(TanaZoomPlugin).zoom.to(id); break;
        case 'out': editor.getTransforms(TanaZoomPlugin).zoom.out(); break;
        case 'collapse': setTanaScopeExpanded(editor, false); break;
        case 'expand': setTanaScopeExpanded(editor, true); break;
        case 'collapseAll': setTanaScopeExpanded(editor, false, true); break;
        case 'expandAll': setTanaScopeExpanded(editor, true, true); break;
        case 'up': commands.moveSibling(id, -1); break;
        case 'down': commands.moveSibling(id, 1); break;
        case 'trash': editor.getTransforms(TanaNodeLifecyclePlugin).node.trash(id); break;
        case 'duplicate':
          editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set([id]));
          editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
          break;
        case 'menu': {
          const element = editor.api.toDOMNode(entry[0]);
          if (!element) return false;
          editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set([id]));
          const rect = element.getBoundingClientRect();
          element.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom,
          }));
          break;
        }
        case 'done': commands.toggleDone(id); break;
      }
      event.preventDefault();
      return true;
    },
  }])),
});
