import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';
import { duplicateTanaSubtree } from './tana-node-identity-plugin';
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

test('copying a canonical Node into an empty Node converts that Node into one Block Reference', () => {
  const editor = createEditor([
    { children: [{ text: 'Canonical target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Canonical child' }], id: 'target-child', indent: 1, type: KEYS.p },
    { children: [{ text: '' }], id: 'destination', type: KEYS.p },
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
  const occurrence = editor.children[2];

  assert.equal(occurrence.tanaReferenceTargetId, 'target');
  assert.equal(occurrence.id, 'destination');
  assert.equal(editor.children.length, before.length);
  assert.deepEqual(editor.children.slice(0, 2), beforeTarget);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});

test('copying a Reference occurrence stores and pastes its direct canonical target', () => {
  const editor = createEditor([
    { children: [{ text: 'Canonical target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Stale occurrence title' }], id: 'source-reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    { children: [{ text: '' }], id: 'destination', type: KEYS.p },
  ]);
  const data = clipboard();

  editor.tf.select({ path: [1, 0], offset: 0 });
  assert.equal(writeTanaReferenceClipboardData(editor, data), true);
  assert.deepEqual(JSON.parse(data.getData(TANA_REFERENCE_CLIPBOARD_MIME)), ['target']);
  editor.tf.select({ path: [2, 0], offset: 0 });

  assert.equal(pasteTanaReferenceClipboardData(editor, data), true);
  assert.equal(editor.children[2]?.tanaReferenceTargetId, 'target');
  assert.equal(editor.children[2]?.id, 'destination');
});

test('mid-text paste inserts Inline References without creating a block sibling', () => {
  const editor = createEditor([
    { children: [{ text: 'Canonical target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Before after' }], id: 'destination', type: KEYS.p },
  ]);
  const data = clipboard({ [TANA_REFERENCE_CLIPBOARD_MIME]: JSON.stringify(['target']) });
  const before = structuredClone(editor.children);

  editor.tf.select({ path: [1, 0], offset: 7 });
  assert.equal(pasteTanaReferenceClipboardData(editor, data), true);
  const after = structuredClone(editor.children);

  assert.equal(editor.children.length, 2);
  assert.equal(editor.children[1]?.tanaReferenceTargetId, undefined);
  assert.equal(editor.children[1]?.children.some((child) =>
    child.type === KEYS.mention && child.key === 'target'), true);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});

test('multi-selection preserves document order and plain paste never creates References', () => {
  const editor = createEditor([
    { children: [{ text: 'Parent' }], id: 'parent', type: KEYS.p },
    { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
    { children: [{ text: 'Other' }], id: 'other', type: KEYS.p },
    { children: [{ text: '' }], id: 'destination', type: KEYS.p },
  ]);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set(['parent', 'child', 'other']));

  assert.deepEqual(getTanaReferenceClipboardNodeIds(editor), ['parent', 'other']);
  editor.setOption(BlockSelectionPlugin, 'selectedIds', new Set());
  editor.tf.select({ path: [3, 0], offset: 0 });
  assert.equal(pasteTanaReferenceOccurrences(editor, ['parent', 'other']), true);
  assert.deepEqual(
    editor.children.slice(3).map((node) => node.tanaReferenceTargetId),
    ['parent', 'other']
  );

  const data = clipboard({
    [TANA_REFERENCE_CLIPBOARD_MIME]: JSON.stringify(['parent']),
    'text/plain': 'Plain clipboard text',
  });
  editor.tf.select({ path: [3, 0], offset: 0 });
  assert.equal(pasteTanaReferenceClipboardData(editor, data, true), true);
  assert.equal(editor.children.filter((node) => node.tanaReferenceTargetId === 'parent').length, 1);
  assert.match(String(editor.children[3]?.children[0]?.text), /Plain clipboard text/);
});

test('Duplicate remains an independent subtree copy rather than a Reference', () => {
  const editor = createEditor([
    { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
  ]);
  const copiedIds = duplicateTanaSubtree(editor, [[0]]);
  const copy = editor.children[1];

  assert.equal(copiedIds.length, 1);
  assert.notEqual(copy?.id, 'target');
  assert.equal(copy?.tanaReferenceTargetId, undefined);
  assert.equal(copy?.children[0]?.text, 'Target');
});

test('Duplicate keeps a Field occurrence and list Value subtree owned by the fresh Host IDs', () => {
  const editor = createEditor([
    { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { cardinality: 'list', type: 'plain' }, type: KEYS.p },
    { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
    { children: [{ text: 'One' }], id: 'task-status-one', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    { children: [{ text: 'Two' }], id: 'task-status-two', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
  ]);

  const copiedIds = duplicateTanaSubtree(editor, [[1]]);
  const copiedHostId = copiedIds[0]!;
  const copiedIndex = buildTanaIndex(editor.children);
  const copiedField = copiedIndex.fieldNodesByParent.get(copiedHostId)?.[0];

  assert.equal(copiedIds.length, 4);
  assert.notEqual(copiedHostId, 'task');
  assert.notEqual(copiedField?.id, 'task-status');
  assert.equal(copiedField?.fieldId, 'status');
  assert.deepEqual(copiedField?.values, [
    { type: 'plain', value: 'One' },
    { type: 'plain', value: 'Two' },
  ]);
  assert.deepEqual(copiedField?.valueNodeIds.every((id) => !['task-status-one', 'task-status-two'].includes(id)), true);
});
