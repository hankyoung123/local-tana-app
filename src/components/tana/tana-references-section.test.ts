import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from '@/lib/tana';

import {
  getReferenceBreadcrumb,
  getTanaReferenceGroups,
} from './tana-references-section';

describe('Tana References section', () => {
  test('groups derived backlinks by relation kind without changing their document order', () => {
    const value: Value = [
      {
        children: [{ text: 'Workspace' }],
        id: 'workspace',
        tanaSystemNode: 'workspace',
        type: KEYS.p,
      },
      { children: [{ text: 'Target' }], id: 'target', indent: 1, type: KEYS.p },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 1, type: KEYS.p },
      {
        children: [
          { text: 'Mention ' },
          { children: [{ text: '' }], key: 'target', type: KEYS.mention },
        ],
        id: 'inline-source',
        indent: 2,
        type: KEYS.p,
      },
      { children: [{ text: 'Projects' }], id: 'projects', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Reference' }],
        id: 'node-source',
        indent: 2,
        tanaReferenceTargetId: 'target',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);

    assert.deepEqual(
      getTanaReferenceGroups(index, 'target').map((group) => ({
        kind: group.kind,
        label: group.label,
        sourceNodeIds: group.relations.map((relation) => relation.sourceNodeId),
      })),
      [
        { kind: 'inline', label: 'Mentioned in', sourceNodeIds: ['inline-source'] },
        { kind: 'node', label: 'Referenced in', sourceNodeIds: ['node-source'] },
      ]
    );
  });

  test('orders ancestor labels from workspace to the direct parent', () => {
    const value: Value = [
      {
        children: [{ text: 'Workspace' }],
        id: 'workspace',
        tanaSystemNode: 'workspace',
        type: KEYS.p,
      },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, type: KEYS.p },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 2, type: KEYS.p },
      { children: [{ text: 'Source' }], id: 'source', indent: 3, type: KEYS.p },
    ];

    assert.equal(
      getReferenceBreadcrumb(buildTanaIndex(value), 'source'),
      '工作区 / Home / Notes'
    );
  });
});
