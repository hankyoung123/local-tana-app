import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';

import {
  getNodeSemanticType,
  getNodeSemanticTypes,
} from './node-semantic';

const document: Value = [
  { children: [{ text: 'Content' }], id: 'content', type: KEYS.p },
  {
    children: [{ text: 'Status' }],
    id: 'status',
    tanaFieldDefinition: { type: 'options' },
    type: KEYS.p,
  },
  { children: [{ text: 'Todo' }], id: 'todo', indent: 1, type: KEYS.p },
  { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
  {
    children: [{ text: '' }],
    id: 'task-status',
    indent: 1,
    tanaFieldId: 'status',
    type: KEYS.p,
  },
  {
    children: [{ text: '' }],
    id: 'task-status-value',
    indent: 2,
    tanaFieldValueType: 'options',
    type: KEYS.p,
  },
  {
    children: [{ text: 'Project' }],
    id: 'project',
    tanaSupertagDefinition: {},
    type: KEYS.p,
  },
  {
    children: [{ text: 'Open tasks' }],
    id: 'view',
    tanaViewDefinition: { clauses: [] },
    type: KEYS.p,
  },
  {
    children: [{ text: 'Combined' }],
    id: 'combined',
    tanaFieldDefinition: { type: 'plain' },
    tanaViewDefinition: { clauses: [] },
    type: KEYS.p,
  },
];

function nodeAt(path: number[]): TElement {
  return document[path[0]] as TElement;
}

describe('Node semantic runtime', () => {
  test('derives persisted Node semantics from metadata and hierarchy', () => {
    assert.equal(getNodeSemanticType(nodeAt([0]), { document, path: [0] }), 'content');
    assert.equal(
      getNodeSemanticType(nodeAt([1]), { document, path: [1] }),
      'field-definition'
    );
    assert.equal(getNodeSemanticType(nodeAt([2]), { document, path: [2] }), 'option');
    assert.equal(getNodeSemanticType(nodeAt([4]), { document, path: [4] }), 'field');
    assert.equal(getNodeSemanticType(nodeAt([5]), { document, path: [5] }), 'value');
    assert.equal(
      getNodeSemanticType(nodeAt([6]), { document, path: [6] }),
      'supertag-definition'
    );
    assert.equal(getNodeSemanticType(nodeAt([7]), { document, path: [7] }), 'view');
  });

  test('preserves composable semantics while selecting the existing View renderer priority', () => {
    assert.deepEqual(getNodeSemanticTypes(nodeAt([8]), { document, path: [8] }), [
      'field-definition',
      'view',
    ]);
    assert.equal(getNodeSemanticType(nodeAt([8]), { document, path: [8] }), 'view');
  });

  test('keeps transient Plate elements outside the Tana Node semantic union', () => {
    assert.deepEqual(
      getNodeSemanticTypes(
        { children: [{ text: '' }], key: 'task', type: KEYS.mention },
        { document, path: [0, 0] }
      ),
      ['content']
    );
    assert.deepEqual(
      getNodeSemanticTypes(
        { children: [{ text: '' }], type: KEYS.slashInput },
        { document, path: [0, 0] }
      ),
      ['content']
    );
  });
});
