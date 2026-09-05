import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import { getTanaSupertagPageChildren } from './tana-supertag-page';

describe('Tana Supertag page', () => {
  test('derives child navigation items from direct canonical children in document order', () => {
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
        tanaFieldDefinition: { type: 'options' },
        type: KEYS.p,
      },
      { children: [{ text: 'Todo' }], id: 'todo', indent: 2, type: KEYS.p },
      {
        children: [{ text: '' }],
        id: 'owner-occurrence',
        indent: 1,
        tanaFieldId: 'owner',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Alice' }],
        id: 'owner-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Search' }],
        id: 'search',
        indent: 1,
        tanaSearchDefinition: {
          query: { children: [], type: 'and' },
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'View' }],
        id: 'view',
        indent: 1,
        tanaViewDefinition: { type: 'outline' },
        type: KEYS.p,
      },
      { children: [{ text: 'Nested note' }], id: 'nested', indent: 2, type: KEYS.p },
    ];
    const index = buildTanaIndex(value);

    assert.deepEqual(
      getTanaSupertagPageChildren(index, index.nodesById.get('project')!).map(({ id }) => id),
      ['notes', 'search', 'view']
    );
  });
});
