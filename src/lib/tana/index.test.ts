import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import { buildTanaIndex, getNodeReferenceCandidates } from './index';

const document: Value = [
  {
    id: 'project',
    children: [{ text: 'Project' }],
    tanaSupertagDefinition: { fields: [] },
    type: 'p',
  },
  {
    id: 'task',
    children: [
      { text: 'Ship ' },
      {
        children: [{ text: '' }],
        key: 'project',
        type: 'mention',
        value: 'Project',
      },
      { text: ' ' },
      {
        children: [{ text: '' }],
        key: 'project',
        type: 'tana_supertag',
        value: 'Project',
      },
    ],
    tanaFieldValues: {
      status: { type: 'select', value: 'Active' },
    },
    type: 'p',
  },
];

describe('buildTanaIndex', () => {
  test('derives nodes and backlinks without mutating the document', () => {
    const before = structuredClone(document);
    const index = buildTanaIndex(document);

    assert.deepEqual(
      (({ id, path, text }) => ({ id, path, text }))(
        index.nodesById.get('project')!
      ),
      {
      id: 'project',
      path: [0],
      text: 'Project',
      }
    );
    assert.deepEqual(index.backlinks.get('project'), [
      {
        path: [1, 1],
        sourceNodeId: 'task',
        targetNodeId: 'project',
      },
    ]);
    assert.deepEqual(index.nodesBySupertag.get('project'), ['task']);
    assert.deepEqual(index.fieldValues.get('task'), new Map([
      ['status', { type: 'select', value: 'Active' }],
    ]));
    assert.deepEqual(document, before);
  });

  test('uses Plate node IDs as mention candidate keys', () => {
    assert.deepEqual(getNodeReferenceCandidates(document), [
      { id: 'project', text: 'Project' },
      { id: 'task', text: 'Ship @Project #Project' },
    ]);
  });
});
