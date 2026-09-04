import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import { getTanaDailyNotesGroups } from './tana-daily-notes-view';

describe('Tana Daily Notes View', () => {
  test('groups canonical direct Day Nodes by year and month without a second calendar model', () => {
    const value: Value = [
      { children: [{ text: 'Daily Notes' }], id: 'daily', tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: '2026-01-31' }], id: 'jan', indent: 1, tanaTime: { unit: 'day', value: '2026-01-31' }, type: KEYS.p },
      { children: [{ text: '2026-02-01' }], id: 'feb', indent: 1, tanaTime: { unit: 'day', value: '2026-02-01' }, type: KEYS.p },
      { children: [{ text: 'Normal child' }], id: 'ordinary', indent: 1, type: KEYS.p },
    ];
    const index = buildTanaIndex(value);

    assert.deepEqual(
      getTanaDailyNotesGroups(index, 'daily').map(({ label, nodes }) => [
        label,
        nodes.map((node) => node.id),
      ]),
      [
        ['2026 年 1 月', ['jan']],
        ['2026 年 2 月', ['feb']],
      ]
    );
  });
});
