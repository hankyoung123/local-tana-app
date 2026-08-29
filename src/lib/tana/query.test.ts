import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import { buildTanaIndex } from './index';
import { runTanaQuery } from './query';

const document: Value = [
  {
    id: 'project-tag',
    children: [{ text: 'Project' }],
    tanaSupertagDefinition: { fields: [] },
    type: 'p',
  },
  {
    id: 'alpha',
    children: [
      { text: 'Alpha launch ' },
      {
        children: [{ text: '' }],
        key: 'project-tag',
        type: 'tana_supertag',
        value: 'Project',
      },
    ],
    tanaFieldValues: {
      estimate: { type: 'number', value: 3 },
      status: { type: 'select', value: 'Active' },
    },
    type: 'p',
  },
  {
    id: 'beta',
    children: [{ text: 'Beta notes' }],
    tanaFieldValues: {
      status: { type: 'select', value: 'Done' },
    },
    type: 'p',
  },
];

const index = buildTanaIndex(document);

describe('runTanaQuery', () => {
  test('supports hasSupertag', () => {
    assert.deepEqual(
      runTanaQuery(index, [
        { kind: 'has-supertag', supertagId: 'project-tag' },
      ]).map(({ id }) => id),
      ['alpha']
    );
  });

  test('supports field equals and field exists', () => {
    assert.deepEqual(
      runTanaQuery(index, [
        {
          fieldId: 'status',
          kind: 'field-equals',
          value: { type: 'select', value: 'Active' },
        },
        { fieldId: 'estimate', kind: 'field-exists' },
      ]).map(({ id }) => id),
      ['alpha']
    );
  });

  test('supports case-insensitive text contains', () => {
    assert.deepEqual(
      runTanaQuery(index, [
        { kind: 'text-contains', text: 'BETA' },
      ]).map(({ id }) => id),
      ['beta']
    );
  });
});
