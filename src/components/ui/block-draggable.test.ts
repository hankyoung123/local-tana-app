import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, type NodeEntry, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  canDropOnInteractableTanaNode,
  completeTanaDndDrop,
} from './block-draggable';
import { isTanaNodeElement } from '@/lib/tana/constants';

globalThis.requestAnimationFrame ??= () => 0;

function fixture() {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'A' }], id: 'a', indent: 1, type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
      { children: [{ text: 'C' }], id: 'c', indent: 2, type: KEYS.p },
      { children: [{ text: 'D' }], id: 'd', indent: 3, type: KEYS.p },
      { children: [{ text: 'E' }], id: 'e', indent: 1, type: KEYS.p },
      { children: [{ text: 'Target parent' }], id: 'target-1', indent: 1, type: KEYS.p },
      { children: [{ text: 'Target child' }], id: 'target-2', indent: 2, type: KEYS.p },
      { children: [{ text: 'Target depth' }], id: 'target-3', indent: 3, type: KEYS.p },
      { children: [{ text: 'Tail' }], id: 'tail', indent: 1, type: KEYS.p },
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(
    editor.children.map((node) => node.id as string),
    true
  );
  return editor;
}

/** Mirrors the persisted workspace containers so lifecycle routing is active. */
function workspaceFixture() {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Workspace' }], id: 'workspace', indent: 0, tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Move root' }], id: 'move-root', indent: 2, type: KEYS.p },
      { children: [{ text: 'Move child' }], id: 'move-child', indent: 3, type: KEYS.p },
      { children: [{ text: 'Move grandchild' }], id: 'move-grandchild', indent: 4, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', indent: 2, type: KEYS.p },
      { children: [{ text: 'Target depth' }], id: 'target-depth', indent: 3, type: KEYS.p },
      { children: [{ text: 'Tail' }], id: 'tail', indent: 2, type: KEYS.p },
      { children: [{ text: 'Move child reference' }], id: 'move-reference', indent: 2, tanaReferenceTargetId: 'move-child', type: KEYS.p },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
      { children: [{ text: 'Existing Trash child' }], id: 'trash-child', indent: 2, type: KEYS.p },
      { children: [{ text: 'Existing Trash grandchild' }], id: 'trash-grandchild', indent: 3, type: KEYS.p },
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(
    editor.children.map((node) => node.id as string),
    true
  );
  return editor;
}

function indents(
  editor: ReturnType<typeof fixture> | ReturnType<typeof workspaceFixture>,
  ids: string[]
) {
  return ids.map((id) => {
    const node = editor.children.find((candidate) => candidate.id === id);
    return typeof node?.indent === 'number' ? node.indent : 0;
  });
}

function referenceParentFixture() {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'A' }], id: 'a', indent: 1, type: KEYS.p },
      { children: [{ text: 'A child' }], id: 'a-child', indent: 2, type: KEYS.p },
      { children: [{ text: 'A occurrence' }], id: 'reference', indent: 1, tanaReferenceTargetId: 'a', type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
      { children: [{ text: 'Tail' }], id: 'tail', indent: 1, type: KEYS.p },
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(
    editor.children.map((node) => node.id as string),
    true
  );
  return editor;
}

test('DnD adapter rebases a leaf and a deep subtree without splitting history', () => {
  const leaf = fixture();
  assert.equal(completeTanaDndDrop(leaf, ['a'], [9], 3), true);
  assert.deepEqual(indents(leaf, ['a']), [3]);

  const editor = fixture();
  const before = structuredClone(editor.children);
  assert.equal(completeTanaDndDrop(editor, ['b'], [9], 3), true);
  const after = structuredClone(editor.children);
  assert.deepEqual(indents(editor, ['b', 'c', 'd']), [3, 4, 5]);
  assert.equal(indents(editor, ['c'])[0]! - indents(editor, ['b'])[0]!, 1);
  assert.equal(indents(editor, ['d'])[0]! - indents(editor, ['b'])[0]!, 2);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});

test('DnD adapter normalizes parent-child selection and preserves disjoint root order', () => {
  const parentAndChild = fixture();
  assert.equal(completeTanaDndDrop(parentAndChild, ['b', 'c'], [9], 3), true);
  assert.deepEqual(indents(parentAndChild, ['b', 'c', 'd']), [3, 4, 5]);

  const multiRoot = fixture();
  assert.equal(completeTanaDndDrop(multiRoot, ['b', 'e'], [9], 3), true);
  const movedOrder = multiRoot.children
    .filter((node) => node.id === 'b' || node.id === 'e')
    .map((node) => node.id);
  assert.deepEqual(movedOrder, ['b', 'e']);
  assert.deepEqual(indents(multiRoot, ['b', 'c', 'd', 'e']), [3, 4, 5, 3]);
});

test('DnD uses raw relocation in a full workspace and leaves Trash unchanged', () => {
  const editor = workspaceFixture();
  const before = structuredClone(editor.children);
  const trashIndex = editor.children.findIndex((node) => node.id === 'trash');
  const trashBefore = structuredClone(editor.children.slice(trashIndex));

  // Select a parent and its child. The flat range moves once, after the
  // target's depth, while the separate Reference occurrence stays put.
  assert.equal(
    completeTanaDndDrop(editor, ['move-root', 'move-child'], [7], 3),
    true
  );
  const after = structuredClone(editor.children);

  assert.deepEqual(
    editor.children.slice(4, 7).map((node) => node.id),
    ['move-root', 'move-child', 'move-grandchild']
  );
  assert.deepEqual(indents(editor, [
    'move-root', 'move-child', 'move-grandchild',
  ]), [3, 4, 5]);
  assert.equal(
    editor.children.find((node) => node.id === 'move-reference')?.tanaReferenceTargetId,
    'move-child'
  );

  const trashAfterIndex = editor.children.findIndex((node) => node.id === 'trash');
  assert.deepEqual(editor.children.slice(trashAfterIndex), trashBefore);

  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});

test('DnD adapter rejects protected targets and Zoom-external sources before moving', () => {
  const editor = fixture();
  const source = editor.api.node({ at: [], id: 'b' }) as NodeEntry<TElement>;
  const workspace = editor.api.node({ at: [], id: 'workspace' }) as NodeEntry<TElement>;
  const target = editor.api.node({ at: [], id: 'target-3' }) as NodeEntry<TElement>;

  assert.equal(canDropOnInteractableTanaNode({
    dragEntry: source,
    dragItem: { editorId: editor.id, element: source[0], id: 'b' },
    dropEntry: workspace,
    editor,
  }), false);

  const betweenSelectedRoots = editor.api.node({ at: [], id: 'c' }) as NodeEntry<TElement>;
  const a = editor.api.node({ at: [], id: 'a' }) as NodeEntry<TElement>;
  assert.equal(canDropOnInteractableTanaNode({
    dragEntry: a,
    dragItem: { editorId: editor.id, element: a[0], id: ['a', 'e'] },
    dropEntry: betweenSelectedRoots,
    editor,
  }), false);

  editor.getTransforms(TanaZoomPlugin).zoom.to('b');
  const external = editor.api.node({ at: [], id: 'e' }) as NodeEntry<TElement>;
  assert.equal(canDropOnInteractableTanaNode({
    dragEntry: external,
    dragItem: { editorId: editor.id, element: external[0], id: 'e' },
    dropEntry: target,
    editor,
  }), false);
});

test('DnD cannot place canonical Nodes under a Reference occurrence while the occurrence can move normally', async () => {
  const { buildTanaIndex } = await import('@/lib/tana/index');
  const editor = referenceParentFixture();
  const reference = editor.api.node({ at: [], id: 'reference' }) as NodeEntry<TElement>;
  const b = editor.api.node({ at: [], id: 'b' }) as NodeEntry<TElement>;

  assert.equal(canDropOnInteractableTanaNode({
    dragEntry: b,
    dragItem: { editorId: editor.id, element: b[0], id: 'b' },
    dropEntry: reference,
    editor,
  }), false);
  assert.equal(completeTanaDndDrop(editor, ['b'], [5], 2), false);
  assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('b'), 'workspace');
  assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('a-child'), 'a');

  assert.equal(completeTanaDndDrop(editor, ['reference'], [5], 2), true);
  assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('reference'), 'b');
  assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('a-child'), 'a');
});
