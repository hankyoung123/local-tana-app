import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from './index';
import { createAndQuery } from './query';
import { resolveTanaCollectionSource } from './view-source';

const document: Value = [
  {
    children: [{ text: 'Children view' }],
    id: 'children-view',
    tanaViewDefinition: { type: 'outline' },
    type: KEYS.p,
  },
  { children: [{ text: 'Ordinary child' }], id: 'ordinary-child', indent: 1, type: KEYS.p },
  {
    children: [{ text: 'Field definition' }],
    id: 'field-definition',
    indent: 1,
    tanaFieldDefinition: { type: 'plain' },
    type: KEYS.p,
  },
  {
    children: [{ text: '' }],
    id: 'field-occurrence',
    indent: 1,
    tanaFieldId: 'field-definition',
    type: KEYS.p,
  },
  {
    children: [{ text: 'Value' }],
    id: 'value-node',
    indent: 2,
    tanaFieldValueType: 'plain',
    type: KEYS.p,
  },
  {
    children: [{ text: 'Search view' }],
    id: 'search-view',
    tanaSearchDefinition: {
      query: createAndQuery([{ kind: 'text-contains', text: 'Task' }]),
    },
    tanaViewDefinition: { type: 'outline' },
    type: KEYS.p,
  },
  { children: [{ text: 'Task result' }], id: 'task-result', type: KEYS.p },
  {
    children: [{ text: 'Project' }],
    id: 'project-tag',
    tanaSupertagDefinition: {},
    tanaViewDefinition: { type: 'outline' },
    type: KEYS.p,
  },
  {
    children: [{ text: 'Tagged instance' }],
    id: 'tagged-instance',
    tanaSupertagIds: ['project-tag'],
    type: KEYS.p,
  },
];

describe('Tana View source resolver', () => {
  test('uses direct ordinary children for an ordinary View', () => {
    const index = buildTanaIndex(document);
    const source = resolveTanaCollectionSource(index, index.nodesById.get('children-view')!);

    assert.equal(source.kind, 'children');
    assert.deepEqual(source.nodes.map(({ id }) => id), ['ordinary-child']);
  });

  test('uses the Search query when a Search also carries View presentation', () => {
    const index = buildTanaIndex(document);
    const source = resolveTanaCollectionSource(index, index.nodesById.get('search-view')!);

    assert.equal(source.kind, 'search');
    assert.deepEqual(source.nodes.map(({ id }) => id), ['task-result']);
  });

  test('uses derived instances when a Supertag Definition carries View presentation', () => {
    const index = buildTanaIndex(document);
    const source = resolveTanaCollectionSource(index, index.nodesById.get('project-tag')!);

    assert.equal(source.kind, 'supertag-instances');
    assert.deepEqual(source.nodes.map(({ id }) => id), ['tagged-instance']);
  });
});
