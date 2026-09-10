import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { isTanaNodeElement } from './constants';
import { shiftTanaSubtreeIndent } from '@/components/editor/plugins/tana-node-identity-plugin';
import { buildTanaIndex } from './index';

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
function select(editor: ReturnType<typeof fixture>, i: number) {
  editor.tf.select({ path: [i + 1, 0], offset: 0 });
}
const depthsOf = (editor: ReturnType<typeof fixture>) => editor.children.slice(1).map(n => n.indent);

test('cross-depth DnD delta shifts the complete subtree and preserves relative depth', () => {
  const editor = fixture([1, 2, 3]);
  shiftTanaSubtreeIndent(editor, [1], 2);
  assert.deepEqual(depthsOf(editor), [3, 4, 5]);
  assert.equal((editor.children[2].indent as number) - (editor.children[1].indent as number), 1);
  assert.equal((editor.children[3].indent as number) - (editor.children[1].indent as number), 2);
});
for (const [label, depths, selected, reverse, expected] of [
  ['leaf', [1, 1], [1], false, [1, 2]],
  ['parent with child', [1, 1, 2], [1], false, [1, 2, 3]],
  ['three levels', [1, 1, 2, 3, 1], [1], false, [1, 2, 3, 4, 1]],
  ['outdent parent', [1, 2, 3, 4], [1], true, [1, 1, 2, 3]],
  ['deep subtree', [1, 2, 3, 4, 5, 6], [3], true, [1, 2, 3, 3, 4, 5]],
  ['siblings', [1, 1, 1], [1, 2], false, [1, 2, 2]],
  ['parent and child', [1, 1, 2, 3], [1, 2], false, [1, 2, 3, 4]],
  ['unrelated roots', [1, 1, 2, 1, 2], [1, 3], false, [1, 2, 3, 2, 3]],
  ['workspace boundary', [1, 2], [0], true, [1, 2]],
  ['first sibling', [1, 2], [0], false, [1, 2]],
] as const) {
  test(`subtree indent: ${label}`, () => {
    const editor = fixture([...depths]);
    select(editor, selected[0]);
    if (selected.length > 1) editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(selected.map(i => `n${i}`)));
    const before = structuredClone(editor.children);
    editor.tf.tab({ reverse });
    assert.deepEqual(depthsOf(editor), [...expected]);
    if (JSON.stringify(depths) !== JSON.stringify(expected)) {
      editor.tf.undo();
      assert.deepEqual(editor.children, before);
      editor.tf.redo();
      assert.deepEqual(depthsOf(editor), [...expected]);
    }
  });
}
test('Block Selection menu uses same subtree operation', () => {
  const editor = fixture([1, 1, 2, 3]);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['n1', 'n2']));
  editor.getTransforms(BlockSelectionPlugin).blockSelection.setIndent(1);
  assert.deepEqual(depthsOf(editor), [1, 2, 3, 4]);
});
test('collapsed root carries hidden descendants; hidden root cannot mutate', () => {
  const editor = fixture([1, 1, 2, 3]);
  editor.getApi(TogglePlugin).toggle.toggleIds(['n1'], false);
  select(editor, 2);
  editor.tf.tab({ reverse: false });
  assert.deepEqual(depthsOf(editor), [1, 1, 2, 3]);
  select(editor, 1);
  editor.tf.tab({ reverse: false });
  assert.deepEqual(depthsOf(editor), [1, 2, 3, 4]);
});
test('Zoom direct child cannot outdent and outside cannot indent', () => {
  const editor = fixture([1, 2, 3, 1, 1]);
  editor.getTransforms(TanaZoomPlugin).zoom.to('n0');
  select(editor, 1);
  editor.tf.tab({ reverse: true });
  select(editor, 4);
  editor.tf.tab({ reverse: false });
  assert.deepEqual(depthsOf(editor), [1, 2, 3, 1, 1]);
});
test('system root cannot indent', () => {
  const editor = fixture([1, 1]);
  editor.tf.select({ path: [0, 0], offset: 0 });
  editor.tf.tab({ reverse: false });
  assert.deepEqual(depthsOf(editor), [1, 1]);
  assert.equal(editor.children[0].indent, undefined);
});

test('outdent preserves unselected following siblings under their original parent', () => {
  const editor = fixture([1, 2, 3, 2, 3, 1]);
  select(editor, 1);
  const before = structuredClone(editor.children);
  editor.tf.tab({ reverse: true });
  assert.deepEqual(editor.children.slice(1).map(n => [n.id, n.indent]), [
    ['n0', 1], ['n3', 2], ['n4', 3], ['n1', 1], ['n2', 2], ['n5', 1],
  ]);
  assert.equal(editor.children[editor.selection!.anchor.path[0]].id, 'n1');
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
});
test('outdenting multiple siblings keeps their order and remaining sibling ownership', () => {
  const editor = fixture([1, 2, 3, 2, 2, 1]);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['n1', 'n3']));
  editor.getTransforms(BlockSelectionPlugin).blockSelection.setIndent(-1);
  assert.deepEqual(editor.children.slice(1).map(n => [n.id, n.indent]), [
    ['n0', 1], ['n4', 2], ['n1', 1], ['n2', 2], ['n3', 1], ['n5', 1],
  ]);
});

test('Tab, insert and generic structural moves cannot make a Reference or Search a canonical parent', () => {
  const editor = createPlateEditor({
    plugins: EditorKit,
    nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      { id: 'a', type: KEYS.p, indent: 1, children: [{ text: 'A' }] },
      { id: 'reference', type: KEYS.p, indent: 1, tanaReferenceTargetId: 'a', children: [{ text: '' }] },
      { id: 'b', type: KEYS.p, indent: 1, children: [{ text: 'B' }] },
      { id: 'sibling', type: KEYS.p, indent: 1, children: [{ text: 'Sibling' }] },
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(editor.children.map((node) => String(node.id)), true);

  editor.tf.select({ path: [3, 0], offset: 0 });
  assert.equal(editor.tf.tab({ reverse: false }), true);
  assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('b'), 'workspace');

  const generic = createPlateEditor({
    plugins: EditorKit,
    nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      { id: 'a', type: KEYS.p, indent: 1, children: [{ text: 'A' }] },
      { id: 'b', type: KEYS.p, indent: 2, children: [{ text: 'B' }] },
      { id: 'reference', type: KEYS.p, indent: 1, tanaReferenceTargetId: 'a', children: [{ text: '' }] },
      { id: 'sibling', type: KEYS.p, indent: 1, children: [{ text: 'Sibling' }] },
    ] as Value,
  });
  generic.getApi(TogglePlugin).toggle.toggleIds(generic.children.map((node) => String(node.id)), true);
  assert.equal(generic.tf.moveNodes({ at: [2], to: [4] }), false);
  assert.equal(buildTanaIndex(generic.children).parentNodeIds.get('b'), 'a');

  const search = createPlateEditor({
    plugins: EditorKit,
    nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      { id: 'search', type: KEYS.p, indent: 1, tanaSearchDefinition: { query: { children: [], type: 'and' } }, children: [{ text: 'Search' }] },
      { id: 'b', type: KEYS.p, indent: 1, children: [{ text: 'B' }] },
      { id: 'tail', type: KEYS.p, indent: 1, children: [{ text: 'Tail' }] },
    ] as Value,
  });
  search.getApi(TogglePlugin).toggle.toggleIds(search.children.map((node) => String(node.id)), true);

  search.tf.select({ path: [2, 0], offset: 0 });
  assert.equal(search.tf.tab({ reverse: false }), true);
  assert.equal(buildTanaIndex(search.children).parentNodeIds.get('b'), 'workspace');
  assert.equal(search.tf.insertNodes({
    children: [{ text: 'Inserted' }],
    id: 'inserted',
    indent: 2,
    type: KEYS.p,
  }, { at: [2] }), false);
  assert.equal(buildTanaIndex(search.children).nodesById.has('inserted'), false);
  const searchMove = createPlateEditor({
    plugins: EditorKit,
    nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      { id: 'a', type: KEYS.p, indent: 1, children: [{ text: 'A' }] },
      { id: 'b', type: KEYS.p, indent: 2, children: [{ text: 'B' }] },
      { id: 'search', type: KEYS.p, indent: 1, tanaSearchDefinition: { query: { children: [], type: 'and' } }, children: [{ text: 'Search' }] },
      { id: 'tail', type: KEYS.p, indent: 1, children: [{ text: 'Tail' }] },
    ] as Value,
  });
  searchMove.getApi(TogglePlugin).toggle.toggleIds(searchMove.children.map((node) => String(node.id)), true);
  assert.equal(searchMove.tf.moveNodes({ at: [2], to: [4] }), false);
  assert.equal(buildTanaIndex(searchMove.children).parentNodeIds.get('b'), 'a');
});
