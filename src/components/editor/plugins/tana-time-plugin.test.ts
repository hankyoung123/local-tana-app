import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { isFieldValueValid } from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import { isValidTanaDocument } from '@/lib/tana/persistence';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';
import { TanaTimePlugin } from './tana-time-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

function workspace(): Value {
  return [
    { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
    { children: [{ text: 'Task' }], id: 'task', indent: 2, type: KEYS.p },
    { children: [{ text: 'Daily Notes' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
    {
      children: [{ text: 'Due date' }],
      id: 'due-date',
      indent: 2,
      tanaFieldDefinition: { type: 'date' },
      type: KEYS.p,
    },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  ];
}

describe('Tana time semantics', () => {
  test('lazily creates ordered Day Nodes below Daily Notes and reuses their NodeId', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    const second = time.goToDay('2026-01-02');
    const first = time.goToDay('2026-01-01');

    assert.ok(first);
    assert.ok(second);
    assert.equal(time.goToDay('2026-01-02'), second);
    assert.deepEqual(
      editor.children.map((node) => node.id),
      ['workspace', 'home', 'task', 'daily', first, second, 'schema', 'due-date', 'library', 'settings', 'trash']
    );
    assert.deepEqual(
      editor.children.slice(4, 6).map((node) => [node.indent, node.tanaTime]),
      [
        [2, { unit: 'day', value: '2026-01-01' }],
        [2, { unit: 'day', value: '2026-01-02' }],
      ]
    );
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), second);
    assert.equal(buildTanaIndex(editor.children).timeNodeIds.get('day:2026-01-02'), second);
    assert.equal(isValidTanaDocument(editor.children), true);
  });

  test('restores a trashed canonical Day Node to Daily Notes instead of creating a duplicate', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;
    const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;
    const day = time.goToDay('2026-01-02');

    assert.ok(day);
    assert.equal(lifecycle.trash(day), true);
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get(day), 'trash');
    assert.equal(time.goToDay('2026-01-02'), day);

    const index = buildTanaIndex(editor.children);

    assert.equal(index.parentNodeIds.get(day), 'daily');
    assert.equal(index.timeNodeIds.get('day:2026-01-02'), day);
    assert.equal(
      editor.children.filter(
        (node) => (node as { tanaTime?: { value?: string } }).tanaTime?.value === '2026-01-02'
      ).length,
      1
    );
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), day);
  });

  test('uses the same strict calendar-day identity for Date Fields and Day Nodes', () => {
    const editor = createEditor(workspace());
    const index = buildTanaIndex(editor.children);

    assert.equal(
      isFieldValueValid(index, 'due-date', { type: 'date', value: '2026-02-29' }),
      false
    );
    assert.equal(
      isFieldValueValid(index, 'due-date', { type: 'date', value: '2028-02-29' }),
      true
    );
    assert.ok(editor.getTransforms(TanaTimePlugin).time.goToDay('2028-02-29'));
    assert.equal(buildTanaIndex(editor.children).timeNodeIds.has('day:2028-02-29'), true);
  });

  test('does not create a Day Node for an invalid date', () => {
    const editor = createEditor(workspace());

    assert.equal(editor.getTransforms(TanaTimePlugin).time.goToDay('2026-02-29'), undefined);
    assert.equal(editor.children.some((node) => node.tanaTime), false);
  });
});
