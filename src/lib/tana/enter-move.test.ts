import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, NodeApi, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaNodeIdentityPlugin } from '@/components/editor/plugins/tana-node-identity-plugin';
import { isTanaNodeElement } from './constants';
import { getTanaParentPath } from './outliner';

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

test('Enter inherits Done semantic state on the newly created sibling', () => {
  const editor = fixture([1, 2, 3, 1]);
  editor.tf.setNodes({ tanaDoneState: 'done', checked: true, listStyleType: 'todo' }, { at: [1] });
  editor.tf.select({
    anchor: { path: [1, 0], offset: 6 },
    focus: { path: [1, 0], offset: 6 },
  });
  editor.tf.insertBreak();
  const sibling = editor.children.find((node) =>
    node.id !== 'n0' && node.id !== 'n1' && node.id !== 'n2' && node.id !== 'n3' &&
    node.children[0]?.text === ''
  );
  assert.ok(sibling);
  assert.equal(sibling.tanaDoneState, 'done');
  assert.equal(sibling.checked, true);
  assert.equal(sibling.listStyleType, 'todo');
});

for (const [label, start, end, originalText, freshText] of [
  ['beginning', 0, 2, 'de 0', ''],
  ['middle', 2, 4, 'No', ' 0'],
  ['end', 4, 6, 'Node', ''],
] as const) test(`expanded Enter at ${label} keeps canonical ownership in one history entry`, () => {
  const editor = fixture([1, 2, 3, 1]);
  const before = structuredClone(editor.children);
  editor.tf.select({
    anchor: { path: [1, 0], offset: start },
    focus: { path: [1, 0], offset: end },
  });
  editor.tf.insertBreak();

  const originalPath = editor.children.findIndex((node) => node.id === 'n0');
  const originalChildren = editor.children
    .slice(originalPath + 1)
    .filter((node) => node.id === 'n1' || node.id === 'n2');
  const fresh = editor.children.find((node) =>
    !['workspace', 'n0', 'n1', 'n2', 'n3'].includes(node.id as string)
  );

  assert.ok(fresh);
  assert.equal(new Set(editor.children.map((node) => node.id)).size, editor.children.length);
  assert.equal(originalChildren.length, 2);
  assert.deepEqual(getTanaParentPath(editor.children, [originalPath + 1]), [originalPath]);
  assert.equal(NodeApi.string(editor.children[originalPath]!), originalText);
  assert.equal(NodeApi.string(fresh), freshText);
  assert.deepEqual(Object.keys(fresh).filter((key) => key.startsWith('tana')), []);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.equal(new Set(editor.children.map((node) => node.id)).size, editor.children.length);
});

test('expanded Enter strips every semantic adapter from the fresh ordinary Node', () => {
  const editor = fixture([1, 2, 3, 1]);
  editor.tf.setNodes({
    checked: true,
    listStyleType: 'todo',
    tanaDoneState: 'done',
    tanaFieldDefinition: { type: 'plain' },
    tanaFieldId: 'field',
    tanaPresentation: { hiddenFieldNodeIds: ['n1'] },
    tanaReferenceTargetId: 'n3',
    tanaSearchDefinition: { query: { children: [], type: 'and' } },
    tanaSupertagIds: ['tag'],
    tanaSupertagDefinition: {},
    tanaTime: { unit: 'day', value: '2026-01-01' },
    tanaViewDefinition: { type: 'outline' },
  }, { at: [1] });
  editor.tf.select({
    anchor: { path: [1, 0], offset: 2 },
    focus: { path: [1, 0], offset: 4 },
  });
  editor.tf.insertBreak();

  const fresh = editor.children.find((node) =>
    !['workspace', 'n0', 'n1', 'n2', 'n3'].includes(node.id as string)
  );

  assert.ok(fresh);
  assert.equal(fresh.tanaDoneState, 'done');
  assert.equal(fresh.checked, true);
  assert.equal(fresh.listStyleType, 'todo');
  assert.deepEqual(Object.keys(fresh).filter((key) =>
    [
      'tanaFieldDefinition',
      'tanaFieldId',
      'tanaPresentation',
      'tanaReferenceTargetId',
      'tanaSearchDefinition',
      'tanaSupertagDefinition',
      'tanaSupertagIds',
      'tanaTime',
      'tanaViewDefinition',
    ].includes(key)
  ), []);
});

test('expanded Enter never splits Workspace or crosses a protected system boundary', () => {
  const editor = fixture([1, 1]);
  const before = structuredClone(editor.children);
  editor.tf.select({
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: 4 },
  });
  editor.tf.insertBreak();
  assert.deepEqual(editor.children, before);

  editor.tf.select({
    anchor: { path: [0, 0], offset: 3 },
    focus: { path: [1, 0], offset: 2 },
  });
  editor.tf.insertBreak();
  assert.deepEqual(editor.children, before);
});

test('expanded Enter keeps the system marker on exactly one canonical Node', () => {
  const editor = fixture([1, 1]);
  editor.tf.setNodes({ tanaSystemNode: 'schema' }, { at: [1] });
  editor.tf.select({
    anchor: { path: [1, 0], offset: 2 },
    focus: { path: [1, 0], offset: 4 },
  });
  editor.tf.insertBreak();
  assert.deepEqual(
    editor.children.filter((node) => node.tanaSystemNode === 'schema').map((node) => node.id),
    ['n0']
  );
});

test('expanded Enter across ordinary interactable Nodes deletes then splits through the identity boundary', () => {
  const editor = fixture([1, 1]);
  editor.tf.select({
    anchor: { path: [1, 0], offset: 2 },
    focus: { path: [2, 0], offset: 2 },
  });
  editor.tf.insertBreak();
  assert.equal(new Set(editor.children.map((node) => node.id)).size, editor.children.length);
  assert.ok(editor.children.some((node) => node.id === 'n0'));
});
