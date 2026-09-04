import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import {
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
});
