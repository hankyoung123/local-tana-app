import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import { getTanaSupertagPageChildren } from './tana-supertag-page';

describe('Tana Supertag page', () => {
  test('derives child tabs from direct canonical children in document order', () => {
    const value: Value = [
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 1, type: KEYS.p },
      { children: [{ text: 'Nested note' }], id: 'nested', indent: 2, type: KEYS.p },
    ];
    const index = buildTanaIndex(value);

    assert.deepEqual(
      getTanaSupertagPageChildren(index, index.nodesById.get('project')!).map(({ id }) => id),
      ['status', 'notes']
    );
  });
});
