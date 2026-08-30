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
      },
      { text: ' ' },
      {
        children: [{ text: '' }],
        key: 'project',
        type: 'tana_supertag',
      },
    ],
    tanaFieldValues: {
      status: { type: 'options', value: 'active' },
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
      ['status', { type: 'options', value: 'active' }],
    ]));
    assert.deepEqual(document, before);
  });

  test('uses Plate node IDs as mention candidate keys', () => {
    assert.deepEqual(getNodeReferenceCandidates(document), [
      { id: 'project', text: 'Project' },
      { id: 'task', text: 'Ship @Project #Project' },
    ]);
  });

  test('derives reference and supertag names from the current target node', () => {
    const renamed = structuredClone(document);
    renamed[0].children = [{ text: 'Renamed Project' }];

    assert.equal(
      buildTanaIndex(renamed).nodesById.get('task')?.text,
      'Ship @Renamed Project #Renamed Project'
    );
    assert.equal('value' in (renamed[1].children[1] as object), false);
    assert.equal('value' in (renamed[1].children[3] as object), false);
  });

  test('indexes top-level blocks but not their nested internal elements', () => {
    const withInternalBlocks = [
      ...document,
      {
        id: 'table',
        type: 'table',
        children: [
          {
            id: 'row',
            type: 'tr',
            children: [
              {
                id: 'cell',
                type: 'td',
                children: [
                  { id: 'nested', type: 'p', children: [{ text: 'Nested' }] },
                ],
              },
            ],
          },
        ],
      },
      { id: 'image', type: 'img', url: 'x', children: [{ text: '' }] },
    ] as Value;
    const index = buildTanaIndex(withInternalBlocks);

    assert.equal(index.nodesById.has('table'), true);
    assert.equal(index.nodesById.has('row'), false);
    assert.equal(index.nodesById.has('cell'), false);
    assert.equal(index.nodesById.has('nested'), false);
    assert.equal(index.nodesById.has('image'), true);
  });
});
