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

function indents(editor: ReturnType<typeof fixture>, ids: string[]) {
  return ids.map((id) => {
    const node = editor.children.find((candidate) => candidate.id === id);
    return typeof node?.indent === 'number' ? node.indent : 0;
  });
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
