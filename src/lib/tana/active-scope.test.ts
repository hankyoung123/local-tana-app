import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import {
  getFieldDefinitionCandidatesFromIndex,
  getFieldValueCandidates,
  isFieldValueValid,
} from './fields';
import {
  buildTanaIndex,
  getActiveSupertagInstances,
  getNodeReferenceCandidatesFromIndex,
  getSupertagCandidatesFromIndex,
  isTanaNodeActive,
  searchTanaNodes,
} from './index';

const document: Value = [
  { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
  { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
  { children: [{ text: 'Task' }], id: 'task', indent: 2, tanaSupertagIds: ['project'], type: KEYS.p },
  { children: [{ text: '' }], id: 'task-owner', indent: 3, tanaFieldId: 'owner', type: KEYS.p },
  { children: [{ text: 'Value' }], id: 'task-owner-value', indent: 4, tanaFieldValueType: 'plain', type: KEYS.p },
  { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
  {
    children: [{ text: 'Project' }],
    id: 'project',
    indent: 2,
    tanaSupertagDefinition: {},
    type: KEYS.p,
  },
  {
    children: [{ text: 'Owner' }],
    id: 'owner',
    indent: 2,
    tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' },
    type: KEYS.p,
  },
  { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  {
    children: [{ text: 'Deleted Task' }],
    id: 'deleted-task',
    indent: 2,
    tanaSupertagIds: ['project'],
    type: KEYS.p,
  },
  {
    children: [{ text: 'Deleted Tag' }],
    id: 'deleted-tag',
    indent: 2,
    tanaSupertagDefinition: {},
    type: KEYS.p,
  },
];

describe('Tana active discovery scope', () => {
  test('keeps inactive Nodes resolvable while excluding them from every new candidate surface', () => {
    const index = buildTanaIndex(document);

    assert.equal(isTanaNodeActive(index, 'task'), true);
    assert.equal(isTanaNodeActive(index, 'workspace'), false);
    assert.equal(isTanaNodeActive(index, 'trash'), false);
    assert.equal(isTanaNodeActive(index, 'deleted-task'), false);
    assert.ok(index.nodesById.get('deleted-task'));

    assert.deepEqual(
      getNodeReferenceCandidatesFromIndex(index).map(({ id }) => id),
      ['task', 'project', 'owner']
    );
    assert.deepEqual(
      getSupertagCandidatesFromIndex(index).map(({ id }) => id),
      ['project']
    );
    assert.deepEqual(
      getActiveSupertagInstances(index, 'project').map(({ id }) => id),
      ['task']
    );
    assert.deepEqual(
      getFieldValueCandidates(index, 'owner').map(({ id }) => id),
      ['task']
    );
    assert.deepEqual(
      getFieldDefinitionCandidatesFromIndex(index).map(({ id }) => id),
      ['owner']
    );
    assert.equal(
      isFieldValueValid(index, 'owner', { type: 'from-supertag', value: 'task' }),
      true
    );
    assert.equal(
      isFieldValueValid(index, 'owner', {
        type: 'from-supertag',
        value: 'deleted-task',
      }),
      false
    );
    assert.deepEqual(
      searchTanaNodes(index, 'task').map(({ id }) => id),
      ['task']
    );
  });
});
