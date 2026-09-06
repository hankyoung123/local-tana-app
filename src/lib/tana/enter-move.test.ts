import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaNodeIdentityPlugin } from '@/components/editor/plugins/tana-node-identity-plugin';
import { isTanaNodeElement } from './constants';

globalThis.requestAnimationFrame ??= () => 0;
function fixture(depths: number[]) {
  const editor = createPlateEditor({
    plugins: EditorKit, nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      ...depths.map((indent, i) => ({ id: `n${i}`, type: KEYS.p, indent, children: [{ text: `Node ${i}` }] })),
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(editor.children.map(n => n.id as string), true);
  return editor;
}
for (const [label, depths, id, direction, expected] of [
  ['leaf up', [1, 1], 'n1', -1, ['n1', 'n0']],
  ['leaf down', [1, 1, 1], 'n0', 1, ['n1', 'n0', 'n2']],
  ['parent up', [1, 2, 1, 2, 1], 'n2', -1, ['n2', 'n3', 'n0', 'n1', 'n4']],
  ['parent down', [1, 2, 1, 2, 1], 'n0', 1, ['n2', 'n3', 'n0', 'n1', 'n4']],
  ['parent past leaf', [1, 2, 1], 'n0', 1, ['n2', 'n0', 'n1']],
  ['deep page', [1, 2, 3, 2, 3], 'n3', -1, ['n0', 'n3', 'n4', 'n1', 'n2']],
  ['first no-op', [1, 1], 'n0', -1, ['n0', 'n1']],
  ['last no-op', [1, 1], 'n1', 1, ['n0', 'n1']],
] as const) {
  test(`sibling move: ${label}`, () => {
    const editor = fixture([...depths]);
    const i = editor.children.findIndex(n => n.id === id);
    editor.tf.select({ path: [i, 0], offset: 2 });
    const before = structuredClone(editor.children);
    const changed = editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity.moveSibling(id, direction);
    assert.deepEqual(editor.children.slice(1).map(n => n.id), [...expected]);
    assert.equal(editor.children[editor.selection!.anchor.path[0]].id, id);
    if (changed) {
      editor.tf.undo();
      assert.deepEqual(editor.children, before);
    }
  });
}
for (const before of [true, false]) test(`explicit insert ${before ? 'before' : 'after'} preserves subtree`, () => {
  const editor = fixture([1, 2, 3, 1]);
  const snapshot = structuredClone(editor.children);
  const tf = editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity;
  assert.equal(before ? tf.insertBefore('n0') : tf.insertAfter('n0'), true);
  const newIndex = before ? 1 : 4;
  assert.equal(editor.children[newIndex].indent, 1);
  assert.ok(!snapshot.some(n => n.id === editor.children[newIndex].id));
  assert.deepEqual(editor.children.filter((_, i) => i !== newIndex), snapshot);
  editor.tf.undo();
  assert.deepEqual(editor.children, snapshot);
});

for (const offset of [0, 3, 6]) test(`Enter at offset ${offset} preserves identity, subtree and one undo`, () => {
  const editor = fixture([1, 2, 3, 1]);
  const before = structuredClone(editor.children);
  editor.tf.select({ path: [1, 0], offset });
  editor.tf.insertBreak();
  const original = editor.children.findIndex(n => n.id === 'n0');
  assert.equal(editor.children[original + 1].id, 'n1');
  assert.equal(editor.children[original + 2].id, 'n2');
  assert.equal(editor.children.length, before.length + 1);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
});
