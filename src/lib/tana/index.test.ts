import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import {
  buildTanaIndex,
  getNodeReferenceCandidatesFromIndex,
  searchTanaNodes,
} from './index';

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
    assert.deepEqual(getNodeReferenceCandidatesFromIndex(buildTanaIndex(document)), [
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

  test('searches by exact, prefix, then contains in document order', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Project' }], id: 'exact', type: 'p' },
      { children: [{ text: 'Project brief' }], id: 'prefix-first', type: 'p' },
      { children: [{ text: 'Project plan' }], id: 'prefix-second', type: 'p' },
      {
        children: [{ text: 'Archived project notes' }],
        id: 'contains-first',
        type: 'p',
      },
      {
        children: [{ text: 'Another project' }],
        id: 'contains-second',
        type: 'p',
      },
    ]);

    assert.deepEqual(
      searchTanaNodes(index, ' project ').map(({ id }) => id),
      ['exact', 'prefix-first', 'prefix-second', 'contains-first', 'contains-second']
    );
    assert.deepEqual(searchTanaNodes(index, '   '), []);
    assert.deepEqual(
      searchTanaNodes(index, 'project', 2).map(({ id }) => id),
      ['exact', 'prefix-first']
    );
  });
});
