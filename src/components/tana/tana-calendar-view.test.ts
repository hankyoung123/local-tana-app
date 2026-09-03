import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import { getTanaCalendarEntries } from './tana-calendar-view';

describe('Tana Calendar View', () => {
  test('derives placements from both canonical Day Nodes and Date Field Values', () => {
    const value: Value = [
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
      {
        children: [{ text: '2026-03-02' }],
        id: 'task-due-value',
        indent: 2,
        tanaFieldValueType: 'date',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Daily note' }],
        id: 'day-note',
        tanaTime: { unit: 'day', value: '2026-03-01' },
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const results = [
      index.nodesById.get('task')!,
      index.nodesById.get('day-note')!,
    ];

    assert.deepEqual(
      getTanaCalendarEntries(index, results).map(({ day, node }) => [day, node.id]),
      [
        ['2026-03-01', 'day-note'],
        ['2026-03-02', 'task'],
      ]
    );
  });
});
