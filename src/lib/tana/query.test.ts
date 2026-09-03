import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import { buildTanaIndex } from './index';
import {
  describeTanaQueryClause,
  isTanaQueryClauseValid,
  runTanaQuery,
} from './query';

const document: Value = [
  {
    id: 'project-tag',
    children: [{ text: 'Project' }],
    tanaSupertagDefinition: {},
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
    tanaFieldDefinition: { type: 'options' },
    type: 'p',
  },
  { id: 'active', children: [{ text: 'Active' }], indent: 1, type: 'p' },
  { id: 'done', children: [{ text: 'Done' }], indent: 1, type: 'p' },
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
    tanaSupertagIds: ['project-tag'],
    type: 'p',
  },
  { children: [{ text: '' }], id: 'alpha-estimate', indent: 1, tanaFieldId: 'estimate', type: 'p' },
  { children: [{ text: '3' }], id: 'alpha-estimate-value', indent: 2, tanaFieldValueType: 'number', type: 'p' },
  { children: [{ text: '' }], id: 'alpha-status', indent: 1, tanaFieldId: 'status', type: 'p' },
  {
    children: [{ children: [{ text: '' }], key: 'active', type: 'mention' }],
    id: 'alpha-status-value',
    indent: 2,
    tanaFieldValueType: 'options',
    type: 'p',
  },
  {
    id: 'beta',
    children: [{ text: 'Beta notes' }],
    type: 'p',
  },
  { children: [{ text: '' }], id: 'beta-status', indent: 1, tanaFieldId: 'status', type: 'p' },
  {
    children: [{ children: [{ text: '' }], key: 'done', type: 'mention' }],
    id: 'beta-status-value',
    indent: 2,
    tanaFieldValueType: 'options',
    type: 'p',
  },
  {
    id: 'gamma',
    children: [{ text: 'Gamma notes' }],
    type: 'p',
  },
  { children: [{ text: '' }], id: 'gamma-estimate', indent: 1, tanaFieldId: 'estimate', type: 'p' },
  { children: [{ text: '' }], id: 'gamma-estimate-value', indent: 2, tanaFieldValueType: 'number', type: 'p' },
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

  test('treats a null Field value as not set for field-exists', () => {
    assert.deepEqual(
      runTanaQuery(index, [{ fieldId: 'estimate', kind: 'field-exists' }]).map(
        ({ id }) => id
      ),
      ['alpha']
    );
  });

  test('matches a FieldValue for field-exists', () => {
    assert.deepEqual(
      runTanaQuery(index, [{ fieldId: 'status', kind: 'field-exists' }]).map(
        ({ id }) => id
      ),
      ['alpha', 'beta']
    );
  });

  test('treats both a template-derived and an ad-hoc Field Node as field-defined', () => {
    assert.deepEqual(
      runTanaQuery(index, [{ fieldId: 'estimate', kind: 'field-defined' }]).map(
        ({ id }) => id
      ),
      ['alpha', 'gamma']
    );
    assert.deepEqual(
      runTanaQuery(index, [{ fieldId: 'status', kind: 'field-defined' }]).map(
        ({ id }) => id
      ),
      ['alpha', 'beta']
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

  test('validates new clauses against existing Tana definitions', () => {
    assert.equal(
      isTanaQueryClauseValid(index, {
        kind: 'has-supertag',
        supertagId: 'project-tag',
      }),
      true
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        kind: 'has-supertag',
        supertagId: 'alpha',
      }),
      false
    );
    assert.equal(
      isTanaQueryClauseValid(index, { fieldId: 'estimate', kind: 'field-exists' }),
      true
    );
    assert.equal(
      isTanaQueryClauseValid(index, { fieldId: 'alpha', kind: 'field-defined' }),
      false
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: 'status',
        kind: 'field-equals',
        value: { type: 'options', value: 'done' },
      }),
      true
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: 'status',
        kind: 'field-equals',
        value: { type: 'options', value: 'alpha' },
      }),
      false
    );
    assert.equal(
      isTanaQueryClauseValid(index, { kind: 'text-contains', text: '  ' }),
      false
    );
  });
});
