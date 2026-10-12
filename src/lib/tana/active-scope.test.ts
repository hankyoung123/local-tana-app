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
  hasTanaSupertag,
  getNodeReferenceCandidatesFromIndex,
  getSupertagCandidatesFromIndex,
  isTanaNodeActive,
  searchTanaNodes,
} from './index';
import { createAndQuery, runTanaQuery } from './query';
import { resolveTanaViewProjection } from './view-projection';

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

  test('does not expose instances from a trashed From-Supertag source', () => {
    const brokenSourceDocument = document.map((node) =>
      node.id === 'owner'
        ? {
            ...node,
            tanaFieldDefinition: {
              sourceSupertagId: 'deleted-tag',
              type: 'from-supertag' as const,
            },
          }
        : node
    );
    const index = buildTanaIndex(brokenSourceDocument);

    assert.deepEqual(getFieldValueCandidates(index, 'owner'), []);
  });

  test('does not expose building-block hidden Supertags in picker candidates', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Visible' }], id: 'visible', tanaSupertagDefinition: {}, type: KEYS.p },
      {
        children: [{ text: 'Hidden' }],
        id: 'hidden',
        tanaSupertagDefinition: { buildingBlock: { hiddenFromSearch: true } },
        type: KEYS.p,
      },
    ]);

    assert.deepEqual(getSupertagCandidatesFromIndex(index).map(({ id }) => id), ['visible']);
  });

  test('keeps inherited membership consistent across Search, View, instances, and Field candidates', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Base' }], id: 'base', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: 'Child' }], id: 'child', tanaSupertagDefinition: { extends: ['base'] }, type: KEYS.p },
      { children: [{ text: 'Tagged child' }], id: 'instance', tanaSupertagIds: ['child'], type: KEYS.p },
      { children: [{ text: 'Owner' }], id: 'owner', tanaFieldDefinition: { sourceSupertagId: 'base', type: 'from-supertag' }, type: KEYS.p },
      { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'table' }, type: KEYS.p },
    ]);
    const view = index.nodesById.get('view')!;
    const viewResult = resolveTanaViewProjection(index, {
      ...view,
      viewDefinition: {
        filter: { clauses: [{ kind: 'has-supertag', supertagId: 'base' }], mode: 'and' },
        type: 'table',
      },
    }, getActiveSupertagInstances(index, 'base'));

    assert.equal(hasTanaSupertag(index, 'instance', 'base'), true);
    assert.deepEqual(
      runTanaQuery(index, createAndQuery([{ kind: 'has-supertag', supertagId: 'base' }])).map(({ id }) => id),
      ['instance']
    );
    assert.deepEqual(getActiveSupertagInstances(index, 'base').map(({ id }) => id), ['instance']);
    assert.deepEqual(viewResult.items.map(({ occurrence }) => occurrence.id), ['instance']);
    assert.deepEqual(getFieldValueCandidates(index, 'owner').map(({ id }) => id), ['instance']);
  });

  test('fails closed for missing or trashed ancestors across derived membership and title expressions', () => {
    const missingParentIndex = buildTanaIndex([
      { children: [{ text: 'Child' }], id: 'child', tanaSupertagDefinition: { extends: ['missing'] }, type: KEYS.p },
      { children: [{ text: 'Tagged child' }], id: 'instance', tanaSupertagIds: ['child'], type: KEYS.p },
    ]);
    const trashedParentIndex = buildTanaIndex([
      { children: [{ text: 'Trash' }], id: 'trash', tanaSystemNode: 'trash', type: KEYS.p },
      { children: [{ text: 'Base' }], id: 'base', indent: 1, tanaSupertagDefinition: { titleExpression: 'Stale ${name}' }, type: KEYS.p },
      { children: [{ text: 'Child' }], id: 'child', tanaSupertagDefinition: { extends: ['base'] }, type: KEYS.p },
      { children: [{ text: 'Tagged child' }], id: 'instance', tanaSupertagIds: ['child'], type: KEYS.p },
      { children: [{ text: 'Owner' }], id: 'owner', tanaFieldDefinition: { sourceSupertagId: 'child', type: 'from-supertag' }, type: KEYS.p },
      { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'table' }, type: KEYS.p },
    ]);
    const view = trashedParentIndex.nodesById.get('view')!;
    const viewResult = resolveTanaViewProjection(trashedParentIndex, {
      ...view,
      viewDefinition: {
        filter: { clauses: [{ kind: 'has-supertag', supertagId: 'child' }], mode: 'and' },
        type: 'table',
      },
    }, [trashedParentIndex.nodesById.get('instance')!]);

    assert.equal(hasTanaSupertag(missingParentIndex, 'instance', 'child'), false);
    assert.deepEqual(getActiveSupertagInstances(missingParentIndex, 'child'), []);
    assert.equal(hasTanaSupertag(trashedParentIndex, 'instance', 'child'), false);
    assert.deepEqual(getActiveSupertagInstances(trashedParentIndex, 'child'), []);
    assert.deepEqual(
      runTanaQuery(trashedParentIndex, createAndQuery([{ kind: 'has-supertag', supertagId: 'child' }])),
      []
    );
    assert.deepEqual(viewResult.items, []);
    assert.deepEqual(getFieldValueCandidates(trashedParentIndex, 'owner'), []);
    assert.equal(trashedParentIndex.nodesById.get('instance')?.titleExpression, undefined);
  });
});
