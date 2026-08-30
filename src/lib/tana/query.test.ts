import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import { buildTanaIndex } from './index';
import { describeTanaQueryClause, runTanaQuery } from './query';

const document: Value = [
  {
    id: 'project-tag',
    children: [{ text: 'Project' }],
    tanaSupertagDefinition: {
      fields: [{ fieldId: 'estimate' }, { fieldId: 'status' }],
    },
    type: 'p',
  },
  {
    id: 'estimate',
    children: [{ text: 'Estimate' }],
    tanaFieldDefinition: { type: 'number' },
    type: 'p',
  },
  {
    id: 'status',
    children: [{ text: 'Status' }],
    tanaFieldDefinition: { options: ['active', 'done'], type: 'options' },
    type: 'p',
  },
  { id: 'active', children: [{ text: 'Active' }], type: 'p' },
  { id: 'done', children: [{ text: 'Done' }], type: 'p' },
  {
    id: 'alpha',
    children: [
      { text: 'Alpha launch ' },
      {
        children: [{ text: '' }],
        key: 'project-tag',
        type: 'tana_supertag',
      },
    ],
    tanaFieldValues: {
      estimate: { type: 'number', value: 3 },
      status: { type: 'options', value: 'active' },
    },
    type: 'p',
  },
  {
    id: 'beta',
    children: [{ text: 'Beta notes' }],
    tanaFieldValues: {
      status: { type: 'options', value: 'done' },
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
          value: { type: 'options', value: 'active' },
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

  test('describes query clauses in the Chinese interface without changing query semantics', () => {
    assert.equal(
      describeTanaQueryClause(index, {
        kind: 'has-supertag',
        supertagId: 'project-tag',
      }),
      '包含 #Project'
    );
    assert.equal(
      describeTanaQueryClause(index, {
        kind: 'field-equals',
        fieldId: 'status',
        value: { type: 'options', value: 'active' },
      }),
      'Status 等于 active'
    );
  });
});
