import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { TanaReferencePlugin } from './tana-reference-plugin';
import {
  getTanaReferenceClipboardNodeIds,
  pasteTanaReferenceClipboardData,
  pasteTanaReferenceOccurrences,
  TANA_REFERENCE_CLIPBOARD_MIME,
  writeTanaReferenceClipboardData,
} from './tana-reference-clipboard-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

function clipboard(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));

  return {
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
  };
}

test('empty @ selection converts the current Node into a canonical block Reference', () => {
  const editor = createEditor([
    { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
    {
      children: [{ children: [{ text: '' }], trigger: '@', type: KEYS.mentionInput }],
      id: 'empty-node',
      type: KEYS.p,
    },
  ]);
  editor.tf.select({ path: [1, 0, 0], offset: 0 });

  assert.equal(
    editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode('empty-node', 'target'),
    true
  );
  assert.deepEqual(editor.children[1], {
    children: [{ text: '' }],
    id: 'empty-node',
    tanaReferenceTargetId: 'target',
    type: KEYS.p,
  });
  assert.equal(
    editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode('empty-node', 'target'),
    false
  );
});

test('mid-text @ stays an Inline Reference and targets only canonical live Nodes', () => {
  const editor = createEditor([
    { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Use ' }], id: 'content', type: KEYS.p },
    { children: [{ text: '' }], id: 'blank', type: KEYS.p },
    { children: [{ text: 'Occurrence' }], id: 'occurrence', tanaReferenceTargetId: 'target', type: KEYS.p },
    { children: [{ text: 'Broken' }], id: 'broken', tanaReferenceTargetId: 'missing', type: KEYS.p },
  ]);
  editor.tf.select({ path: [1, 0], offset: 4 });
  editor.getTransforms({ key: KEYS.mention }).insert.mention({
    key: 'target',
    search: '',
    value: undefined,
  });

  assert.equal(editor.children[1].tanaReferenceTargetId, undefined);
  assert.equal(editor.children[1].children[1]?.type, KEYS.mention);
  assert.equal(editor.children[1].children[1]?.key, 'target');
  assert.equal(
    editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode('blank', 'occurrence'),
    false
  );
  assert.equal(
    editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode('blank', 'broken'),
    false
  );
});

test('application copy and paste creates fresh Reference occurrences without copying targets', () => {
  const editor = createEditor([
    { children: [{ text: 'Canonical target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Canonical child' }], id: 'target-child', indent: 1, type: KEYS.p },
    { children: [{ text: 'Paste after me' }], id: 'destination', type: KEYS.p },
  ]);
  editor.tf.select({ path: [0, 0], offset: 0 });
  const data = clipboard();

  assert.equal(writeTanaReferenceClipboardData(editor, data), true);
  assert.deepEqual(JSON.parse(data.getData(TANA_REFERENCE_CLIPBOARD_MIME)), ['target']);

  const beforeTarget = structuredClone(editor.children.slice(0, 2));
  editor.tf.select({ path: [2, 0], offset: 0 });
  const before = structuredClone(editor.children);

  assert.equal(pasteTanaReferenceClipboardData(editor, data), true);
  const after = structuredClone(editor.children);
  const occurrence = editor.children[3];

  assert.equal(occurrence.tanaReferenceTargetId, 'target');
  assert.notEqual(occurrence.id, 'target');
  assert.deepEqual(editor.children.slice(0, 2), beforeTarget);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});

test('multi-selection uses disjoint canonical roots in order and plain paste never creates References', () => {
  const editor = createEditor([
    { children: [{ text: 'Parent' }], id: 'parent', type: KEYS.p },
    { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
    { children: [{ text: 'Other' }], id: 'other', type: KEYS.p },
    { children: [{ text: 'Destination' }], id: 'destination', type: KEYS.p },
  ]);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['parent', 'child', 'other']));

  assert.deepEqual(getTanaReferenceClipboardNodeIds(editor), ['parent', 'other']);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set());
  editor.tf.select({ path: [3, 0], offset: 0 });
  assert.equal(pasteTanaReferenceOccurrences(editor, ['parent', 'other']), true);
  assert.deepEqual(
    editor.children.slice(4).map((node) => node.tanaReferenceTargetId),
    ['parent', 'other']
  );

  const data = clipboard({
    [TANA_REFERENCE_CLIPBOARD_MIME]: JSON.stringify(['parent']),
    'text/plain': 'Plain clipboard text',
  });
  editor.tf.select({ path: [3, 0], offset: 0 });
  assert.equal(pasteTanaReferenceClipboardData(editor, data, true), true);
  assert.equal(editor.children.filter((node) => node.tanaReferenceTargetId === 'parent').length, 1);
  assert.match(String(editor.children[3].children[0].text), /Plain clipboard text/);
});
