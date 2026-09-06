import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaShortcutsPlugin } from '@/components/editor/plugins/tana-shortcuts-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { isTanaNodeElement } from './constants';
function fixture() {
  const editor = createPlateEditor({ plugins: EditorKit, nodeId: { filter: isTanaNodeElement }, value: [
    { id: 'workspace', indent: 0, tanaSystemNode: 'workspace' },
    { id: 'page', indent: 1 }, { id: 'child', indent: 2 }, { id: 'grandchild', indent: 3 },
    { id: 'other', indent: 1 }, { id: 'other-child', indent: 2 },
    { id: 'trash', indent: 1, tanaSystemNode: 'trash' },
    { id: 'deleted', indent: 2 }, { id: 'deleted-child', indent: 3 },
  ].map(n => ({ ...n, type: KEYS.p, children: [{ text: n.id }] })) as Value });
  editor.getApi(TogglePlugin).toggle.toggleIds(editor.children.map(n => n.id as string), true);
  return editor;
}
test('current collapse and expand share Toggle openIds and never write document', () => {
  const editor = fixture();
  const before = structuredClone(editor.children);
  editor.tf.select({ path: [1, 0], offset: 0 });
  const commands = editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts;
  commands.collapseCurrentNode();
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('page'), false);
  commands.expandCurrentNode();
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('page'), true);
  assert.deepEqual(editor.children, before);
});
test('workspace collapse excludes trash subtrees', () => {
  const editor = fixture();
  editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts.collapseAllWithinScope();
  const open = editor.getOptions(TogglePlugin).openIds!;
  assert.equal(open.has('page'), false);
  assert.equal(open.has('other'), false);
  assert.equal(open.has('deleted'), true);
  assert.equal(open.has('workspace'), true);
});
test('Zoom collapse/expand changes only current page subtree', () => {
  const editor = fixture();
  editor.getTransforms(TanaZoomPlugin).zoom.to('page');
  const commands = editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts;
  commands.collapseAllWithinScope();
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('child'), false);
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('page'), true);
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('other'), true);
  commands.expandAllWithinScope();
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('child'), true);
});

test('scope collapse returns hidden caret to its visible collapsed ancestor', () => {
  const editor = fixture();
  editor.tf.select({ path: [3, 0], offset: 2 });
  editor.getTransforms(TanaShortcutsPlugin).tanaShortcuts.collapseAllWithinScope();
  assert.equal(editor.children[editor.selection!.anchor.path[0]].id, 'page');
});
