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
    tanaSupertagDefinition: {},
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
    type: 'p',
    tanaSupertagIds: ['project'],
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
        kind: 'inline',
        path: [1, 1],
        sourceNodeId: 'task',
        targetNodeId: 'project',
      },
    ]);
    assert.deepEqual(index.nodesBySupertag.get('project'), ['task']);
    assert.equal(index.fieldValues.has('task'), false);
    assert.deepEqual(document, before);
  });

  test('uses Plate node IDs as mention candidate keys', () => {
    assert.deepEqual(getNodeReferenceCandidatesFromIndex(buildTanaIndex(document)), [
      { id: 'project', text: 'Project' },
      { id: 'task', text: 'Ship @Project #Project' },
    ]);
  });

  test('derives Supertag membership only from Node metadata, not inline presentation', () => {
    const tokenOnly: Value = [
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: 'p' },
      {
        children: [
          { text: 'Task ' },
          { children: [{ text: '' }], key: 'project', type: 'tana_supertag' },
        ],
        id: 'task',
        type: 'p',
      },
    ];
    const semanticMembership: Value = [
      tokenOnly[0],
      { ...tokenOnly[1], tanaSupertagIds: ['project'] },
    ];

    assert.equal(buildTanaIndex(tokenOnly).nodesBySupertag.has('project'), false);
    assert.deepEqual(buildTanaIndex(semanticMembership).nodesBySupertag.get('project'), [
      'task',
    ]);
  });

  test('derives block Reference Nodes and inline Mentions through one backlink relation', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Project' }], id: 'project', type: 'p' },
      {
        children: [{ text: 'Project reference' }],
        id: 'project-reference',
        tanaReferenceTargetId: 'project',
        type: 'p',
      },
      {
        children: [
          { text: 'See ' },
          { children: [{ text: '' }], key: 'project', type: 'mention' },
        ],
        id: 'task',
        type: 'p',
      },
    ]);

    assert.equal(index.referenceTargetsByNode.get('project-reference'), 'project');
    assert.deepEqual(index.references.map(({ kind, sourceNodeId, targetNodeId }) => ({
      kind,
      sourceNodeId,
      targetNodeId,
    })), [
      { kind: 'node', sourceNodeId: 'project-reference', targetNodeId: 'project' },
      { kind: 'inline', sourceNodeId: 'task', targetNodeId: 'project' },
    ]);
    assert.equal(index.backlinks.get('project')?.length, 2);
  });

  test('keeps a dangling Field Definition readable as a broken derived relation', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Task' }], id: 'task', type: 'p' },
      {
        children: [{ text: '' }],
        id: 'missing-field',
        indent: 1,
        tanaFieldId: 'deleted-definition',
        type: 'p',
      },
      {
        children: [{ text: 'Historical value' }],
        id: 'missing-field-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: 'p',
      },
    ]);

    assert.equal(index.fieldNodesById.get('missing-field')?.brokenFieldDefinition, true);
    assert.deepEqual(index.fieldNodesById.get('missing-field')?.values, []);
  });

  test('derives Field values exclusively from occurrence and value Nodes', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: 'p' },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: 'p' },
      { children: [{ text: 'Task' }], id: 'task', type: 'p' },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: 'p' },
      {
        children: [{ children: [{ text: '' }], key: 'active', type: 'mention' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'options',
        type: 'p',
      },
    ]);

    assert.deepEqual(index.fieldValues.get('task'), new Map([
      ['status', { type: 'options', value: 'active' }],
    ]));
    assert.deepEqual(index.fieldNodesByParent.get('task')?.map((field) => ({
      fieldId: field.fieldId,
      id: field.id,
      valueNodeId: field.valueNodeId,
    })), [{ fieldId: 'status', id: 'task-status', valueNodeId: 'task-status-value' }]);
    assert.equal(index.nodesById.get('status')?.semanticType, 'field-definition');
    assert.equal(index.nodesById.get('active')?.semanticType, 'option');
    assert.equal(index.nodesById.get('task-status')?.semanticType, 'field');
    assert.equal(index.nodesById.get('task-status-value')?.semanticType, 'value');
  });

  test('keeps an invalid reference-shaped value as an unset Field', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: 'p' },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: 'p' },
      { children: [{ text: 'Other' }], id: 'other', type: 'p' },
      { children: [{ text: 'Task' }], id: 'task', type: 'p' },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: 'p' },
      {
        children: [{ children: [{ text: '' }], key: 'other', type: 'mention' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'options',
        type: 'p',
      },
    ]);

    assert.equal(index.fieldValues.get('task')?.has('status') ?? false, false);
    assert.equal(index.fieldNodesById.get('task-status')?.value, undefined);
  });

  test('derives numbers from Plate text while preserving intermediate input', () => {
    const numberDocument: Value = [
      { children: [{ text: 'Estimate' }], id: 'estimate', tanaFieldDefinition: { type: 'number' }, type: 'p' },
      { children: [{ text: 'Draft' }], id: 'draft', type: 'p' },
      { children: [{ text: '' }], id: 'draft-estimate', indent: 1, tanaFieldId: 'estimate', type: 'p' },
      { children: [{ text: '1.' }], id: 'draft-estimate-value', indent: 2, tanaFieldValueType: 'number', type: 'p' },
      { children: [{ text: 'Final' }], id: 'final', type: 'p' },
      { children: [{ text: '' }], id: 'final-estimate', indent: 1, tanaFieldId: 'estimate', type: 'p' },
      { children: [{ text: '1.20' }], id: 'final-estimate-value', indent: 2, tanaFieldValueType: 'number', type: 'p' },
    ];
    const index = buildTanaIndex(numberDocument);

    assert.equal(index.fieldValues.get('draft')?.has('estimate') ?? false, false);
    assert.deepEqual(index.fieldValues.get('final')?.get('estimate'), {
      type: 'number',
      value: 1.2,
    });
    assert.equal(index.nodesById.get('draft-estimate-value')?.text, '1.');
    assert.equal(index.nodesById.get('final-estimate-value')?.text, '1.20');
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

test('search includes Field labels and values, Supertags, and reference target semantics', () => {
  const document = [
    { id: 'tag', type: 'p', tanaSupertagDefinition: {}, children: [{ text: 'Research' }] },
    { id: 'field', type: 'p', tanaFieldDefinition: { type: 'plain' as const }, children: [{ text: 'Location' }] },
    { id: 'owner', type: 'p', tanaSupertagIds: ['tag'], children: [{ text: 'Project' }] },
    { id: 'occurrence', type: 'p', indent: 1, tanaFieldId: 'field', children: [{ text: '' }] },
    { id: 'value', type: 'p', indent: 2, tanaFieldValueType: 'plain' as const, children: [{ text: 'Shanghai' }] },
    { id: 'reference', type: 'p', tanaReferenceTargetId: 'owner', children: [{ text: '' }] },
  ];
  const index = buildTanaIndex(document);
  for (const query of ['research', 'location', 'shanghai', 'project']) {
    const ids = searchTanaNodes(index, query).map((node) => node.id);
    assert.ok(ids.includes('owner'), query);
    assert.ok(ids.includes('reference'), query);
  }
});

test('search excludes broken, trashed-target and chained References without falling back to occurrence text', () => {
  const document: Value = [
    { id: 'target', type: 'p', children: [{ text: 'Canonical title' }] },
    { id: 'live', type: 'p', tanaReferenceTargetId: 'target', children: [{ text: 'Occurrence fallback' }] },
    { id: 'broken', type: 'p', tanaReferenceTargetId: 'missing', children: [{ text: 'Canonical fallback' }] },
    { id: 'chain', type: 'p', tanaReferenceTargetId: 'live', children: [{ text: 'Canonical fallback' }] },
    { id: 'archived-reference', type: 'p', tanaReferenceTargetId: 'archived', children: [{ text: 'Canonical fallback' }] },
    { id: 'trash', type: 'p', tanaSystemNode: 'trash', children: [{ text: 'Trash' }] },
    { id: 'archived', type: 'p', indent: 1, children: [{ text: 'Canonical archived' }] },
  ];
  const before = structuredClone(document);
  const index = buildTanaIndex(document);
  assert.deepEqual(searchTanaNodes(index, 'canonical').map(({ id }) => id), ['target', 'live']);
  assert.deepEqual(searchTanaNodes(index, 'fallback'), []);
  assert.deepEqual(searchTanaNodes(index, 'archived'), []);
  assert.equal(searchTanaNodes(index, 'canonical')[1], index.nodesById.get('live'));
  assert.deepEqual(document, before);
});
