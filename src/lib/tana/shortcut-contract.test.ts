import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { isTanaNodeElement } from './constants';
globalThis.requestAnimationFrame ??= () => 0;
function fixture() {
  const editor = createPlateEditor({ plugins: EditorKit, nodeId: { filter: isTanaNodeElement }, value: [
    { id: 'workspace', indent: 0, tanaSystemNode: 'workspace' },
    { id: 'a', indent: 1 }, { id: 'a-child', indent: 2 },
    { id: 'b', indent: 1 }, { id: 'b-child', indent: 2 },
    { id: 'trash', indent: 1, tanaSystemNode: 'trash' },
  ].map(n => ({ ...n, type: KEYS.p, children: [{ text: n.id }] })) as Value });
  editor.getApi(TogglePlugin).toggle.toggleIds(['workspace', 'a', 'b'], true);
  editor.tf.select({ path: [3, 0], offset: 1 });
  return editor;
}
function run(editor: ReturnType<typeof fixture>, action: string, composing = false) {
  const shortcut = editor.meta.shortcuts[`tanaShortcuts.${action}`];
  assert.ok(shortcut?.handler);
  shortcut.handler({ editor, event: { isComposing: composing, keyCode: 0, preventDefault() {} } as KeyboardEvent, eventDetails: {} as never });
}
test('Done cycles semantic state while preserving identity, hierarchy, and checkbox presentation', () => {
  const editor = fixture();
  run(editor, 'done');
  assert.equal(editor.children[3].tanaDoneState, 'todo');
  assert.equal(editor.children[3].checked, false);
  assert.equal(editor.children[3].listStyleType, 'todo');
  assert.equal(editor.children[3].id, 'b');
  assert.equal(editor.children[3].indent, 1);
  run(editor, 'done');
  assert.equal(editor.children[3].tanaDoneState, 'done');
  assert.equal(editor.children[3].checked, true);
  run(editor, 'done');
  assert.equal(editor.children[3].tanaDoneState, undefined);
  assert.equal(editor.children[3].checked, undefined);
});
test('Done adapter fields cannot remain independent from tanaDoneState', () => {
  const editor = fixture();

  editor.tf.setNodes({ checked: true }, { at: [3] });
  assert.equal(editor.children[3].tanaDoneState, undefined);
  assert.equal(editor.children[3].checked, undefined);

  editor.tf.setNodes({ checked: false, listStyleType: 'todo' }, { at: [3] });
  assert.equal(editor.children[3].tanaDoneState, 'todo');
  assert.equal(editor.children[3].checked, false);

  editor.tf.withoutNormalizing(() => {
    editor.tf.setNodes({ tanaDoneState: 'done', checked: false }, { at: [3] });
  });
  assert.equal(editor.children[3].tanaDoneState, 'done');
  assert.equal(editor.children[3].checked, true);
  assert.equal(editor.children[3].listStyleType, 'todo');
});
test('Zoom shortcuts use canonical zoom and no formatting aliases remain', () => {
  const editor = fixture();
  run(editor, 'in');
  assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'b');
  run(editor, 'out');
  assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'workspace');
  for (const [name, shortcut] of Object.entries(editor.meta.shortcuts)) {
    if (name.startsWith('tanaShortcuts.')) continue;
    assert.ok(!['mod+enter', 'mod+shift+enter', 'mod+comma', 'mod+period'].includes(String(shortcut?.keys)), name);
  }
});
test('move and collapse shortcuts act on complete canonical subtree', () => {
  const editor = fixture();
  run(editor, 'up');
  assert.deepEqual(editor.children.map(n => n.id), ['workspace', 'b', 'b-child', 'a', 'a-child', 'trash']);
  run(editor, 'down');
  assert.equal(editor.children[3].id, 'b');
  run(editor, 'collapse');
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('b'), false);
  run(editor, 'expand');
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('b'), true);
});
test('shortcut aliases add scoped Collapse All, Expand All and Windows Zoom', () => {
  const editor = fixture();
  assert.deepEqual(editor.meta.shortcuts['tanaShortcuts.in']?.keys, ['mod+period', 'alt+right']);
  assert.deepEqual(editor.meta.shortcuts['tanaShortcuts.out']?.keys, ['mod+comma', 'alt+left']);
  assert.deepEqual(editor.meta.shortcuts['tanaShortcuts.collapseAll']?.keys, ['ctrl+meta+up', 'ctrl+alt+up']);
  assert.deepEqual(editor.meta.shortcuts['tanaShortcuts.expandAll']?.keys, ['ctrl+meta+down', 'ctrl+alt+down']);
  run(editor, 'collapseAll');
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('b'), false);
  run(editor, 'expandAll');
  assert.equal(editor.getOptions(TogglePlugin).openIds!.has('b'), true);
});
test('Trash shortcut moves canonical subtree to existing Trash', () => {
  const editor = fixture();
  assert.equal(editor.meta.shortcuts['tanaShortcuts.trash']?.keys, 'mod+shift+backspace');
  run(editor, 'trash');
  assert.deepEqual(editor.children.map(n => n.id), ['workspace', 'a', 'a-child', 'trash', 'b', 'b-child']);
});
test('composition does not execute any outliner shortcut', () => {
  const editor = fixture();
  const before = structuredClone(editor.children);
  for (const action of ['done', 'before', 'after', 'in', 'out', 'up', 'down', 'trash', 'duplicate', 'collapse', 'expand', 'collapseAll', 'expandAll', 'menu']) run(editor, action, true);
  assert.deepEqual(editor.children, before);
});
test('duplicate shortcut includes descendants with fresh identities', () => {
  const editor = fixture();
  run(editor, 'duplicate');
  const titles = editor.children.map(n => n.children[0].text);
  assert.equal(titles.filter(t => t === 'b').length, 2);
  assert.equal(titles.filter(t => t === 'b-child').length, 2);
  assert.equal(new Set(editor.children.map(n => n.id)).size, editor.children.length);
});

test('duplicate remaps subtree-local relations and preserves external relations', () => {
  const editor = fixture();
  editor.tf.setNodes({
    tanaReferenceTargetId: 'b-child',
  }, { at: [3] });
  editor.tf.setNodes({ tanaReferenceTargetId: 'external' }, { at: [4] });
  run(editor, 'duplicate');
  const copiedRoot = editor.children.find((node) =>
    node.id !== 'b' && node.children[0].text === 'b'
  );
  assert.ok(copiedRoot);
  const copiedChild = editor.children.find((node) =>
    node.id !== 'b-child' && node.children[0].text === 'b-child'
  );
  assert.ok(copiedChild);
  assert.equal(copiedRoot.tanaReferenceTargetId, copiedChild.id);
  assert.equal(
    editor.children.find((node) => node.id === copiedChild.id)?.tanaReferenceTargetId,
    'external'
  );
  assert.deepEqual(
    new Set(editor.getOption(BlockSelectionPlugin, 'selectedIds')),
    new Set([copiedRoot.id, copiedChild.id])
  );
});
