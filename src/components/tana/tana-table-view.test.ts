import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { buildTanaIndex } from '@/lib/tana';
import { isTanaNodeElement } from '@/lib/tana/constants';

import {
  getTanaTableAvailableFieldIds,
  getTanaTableFieldIds,
  groupTanaTableNodes,
  setTanaTableFieldValue,
  sortTanaTableNodes,
} from './tana-table-view';

function createEditor(value: Value) {
  let nextId = 0;

  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      idCreator: () => `table-test-${++nextId}`,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value,
  });
}

describe('Tana Table View', () => {
  test('derives columns, ordering, and groups from canonical Field Nodes', () => {
    const value: Value = [
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: 'Beta' }], id: 'beta', type: KEYS.p },
      { children: [{ text: '' }], id: 'beta-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [{ text: 'Doing' }],
        id: 'beta-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
      { children: [{ text: 'Alpha' }], id: 'alpha', type: KEYS.p },
      { children: [{ text: '' }], id: 'alpha-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [{ text: 'Todo' }],
        id: 'alpha-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const nodes = [index.nodesById.get('beta')!, index.nodesById.get('alpha')!];

    assert.deepEqual(getTanaTableFieldIds(index, nodes), ['status']);
    assert.deepEqual(
      sortTanaTableNodes(index, nodes, { direction: 'asc', fieldId: 'status' }).map(
        (node) => node.id
      ),
      ['beta', 'alpha']
    );
    assert.deepEqual(
      groupTanaTableNodes(index, nodes, 'status').map(({ label, nodes: group }) => [
        label,
        group.map((node) => node.id),
      ]),
      [
        ['Doing', ['beta']],
        ['Todo', ['alpha']],
      ]
    );
    assert.deepEqual(nodes.map((node) => node.id), ['beta', 'alpha']);
  });

  test('keeps configured and optional Supertag template Fields available before instances materialize them', () => {
    const value: Value = [
      {
        children: [{ text: 'Configured' }],
        id: 'configured',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Due date' }],
        id: 'due-date',
        indent: 1,
        tanaFieldDefinition: { type: 'date' },
        tanaFieldOptional: true,
        type: KEYS.p,
      },
      {
        children: [{ text: 'Occurrence only' }],
        id: 'occurrence-only',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Instance' }],
        id: 'instance',
        tanaSupertagIds: ['project'],
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'instance-occurrence',
        indent: 1,
        tanaFieldId: 'occurrence-only',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const instance = index.nodesById.get('instance')!;

    assert.deepEqual(
      getTanaTableAvailableFieldIds(index, [instance], ['configured']),
      ['configured', 'due-date', 'occurrence-only']
    );
    assert.deepEqual(getTanaTableAvailableFieldIds(index, [], ['configured']), ['configured']);
  });

  test('materializes an optional Table Field only when its first value is committed', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', type: KEYS.p },
      {
        children: [{ text: 'Due date' }],
        id: 'due-date',
        tanaFieldDefinition: { type: 'date' },
        type: KEYS.p,
      },
    ]);

    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.has('project'), false);
    const beforeCancel = structuredClone(editor.children);
    assert.equal(
      editor.getTransforms(TanaFieldPlugin).field.clearValue('project', 'due-date'),
      false
    );
    assert.deepEqual(editor.children, beforeCancel);

    assert.equal(
      setTanaTableFieldValue(editor, 'project', 'due-date', {
        type: 'date',
        value: '2026-09-05',
      }),
      true
    );

    const index = buildTanaIndex(editor.children);
    const field = index.fieldNodesByParent.get('project')?.[0];

    assert.ok(field);
    assert.equal(field.fieldId, 'due-date');
    assert.deepEqual(field.values, [{ type: 'date', value: '2026-09-05' }]);
    assert.equal(field.valueNodeIds.length, 1);
  });
});
