import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { findElementIdsHiddenInToggle } from '@platejs/toggle/react';
import { KEYS, normalizeNodeId, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { isTanaNodeElement } from './constants';
import {
  getOrdinaryTanaParentPaths,
  getTanaParentPaths,
} from './outliner';
import { promoteTanaParentsToToggles } from '@/components/tana/tana-outliner-behavior';
import { TANA_NODE_TYPES } from './constants';

const outliner: Value = [
  { children: [{ text: 'Parent' }], id: 'parent', type: 'p' },
  { children: [{ text: 'Child' }], id: 'child', indent: 1, type: 'p' },
  { children: [{ text: 'Sibling' }], id: 'sibling', type: 'p' },
];

describe('Tana outliner behavior', () => {
  test('uses the NodeId filter to keep nested elements outside Tana node identity', () => {
    const normalized = normalizeNodeId(
      [
        {
          children: [
            {
              children: [{ text: 'Nested' }],
              type: KEYS.p,
            },
          ],
          type: KEYS.p,
        },
        {
          children: [{ text: 'Display heading' }],
          type: KEYS.h1,
        },
      ],
      {
        allow: [...TANA_NODE_TYPES],
        filter: ([, path]) => path.length === 1,
        idCreator: () => 'top-level-id',
      }
    );

    assert.equal(
      (normalized[0] as { id?: unknown }).id,
      'top-level-id'
    );
    assert.equal('id' in normalized[0].children[0], false);
    assert.equal(isTanaNodeElement(normalized[0], [0]), true);
    assert.equal(isTanaNodeElement(normalized[0].children[0] as never, [0, 0]), false);
    assert.equal('id' in normalized[1], false);
    assert.equal(isTanaNodeElement(normalized[1], [1]), false);
  });

  test('uses Plate Block Selection only for Tana nodes', () => {
    assert.equal(isTanaNodeElement(outliner[0], [0]), true);
    assert.equal(isTanaNodeElement(outliner[1], [0, 0]), false);
    assert.equal(
      isTanaNodeElement(
        { children: [{ text: '' }], id: 'table', type: 'table' },
        [3]
      ),
      false
    );

    const editor = createPlateEditor({
      plugins: [
        BlockSelectionPlugin.configure({
          options: { isSelectable: isTanaNodeElement },
        }),
      ],
      value: [
        outliner[0],
        {
          children: [{ text: '' }],
          id: 'table',
          type: 'table',
        },
        outliner[2],
      ],
    });
    const selection = editor.getApi(BlockSelectionPlugin).blockSelection;

    selection.selectAll();

    assert.deepEqual(
      selection.getNodes().map(([node]) => node.id),
      ['parent', 'sibling']
    );
  });

  test('promotes an ordinary parent and keeps its child visible with Plate Toggle', () => {
    assert.deepEqual(getTanaParentPaths(outliner), [[0]]);
    assert.deepEqual(getOrdinaryTanaParentPaths(outliner), [[0]]);

    const editor = createPlateEditor({
      plugins: [TogglePlugin],
      value: structuredClone(outliner),
    });
    const paths = getOrdinaryTanaParentPaths(editor.children);

    promoteTanaParentsToToggles(editor, paths);

    assert.equal(editor.children[0].type, KEYS.toggle);
    assert.deepEqual(
      findElementIdsHiddenInToggle(
        editor.getOptions(TogglePlugin).openIds ?? new Set<string>(),
        editor.children as never
      ),
      []
    );
  });
});
