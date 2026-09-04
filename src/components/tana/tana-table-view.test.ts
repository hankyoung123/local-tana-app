import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import {
  getTanaTableAvailableFieldIds,
  getTanaTableFieldIds,
  groupTanaTableNodes,
  sortTanaTableNodes,
} from './tana-table-view';

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
});
