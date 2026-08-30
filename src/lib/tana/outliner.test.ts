import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { findElementIdsHiddenInToggle } from '@platejs/toggle/react';
import type { Value } from 'platejs';

import { isTanaNodeElement } from './constants';
import {
  getOrdinaryTanaParentPaths,
  getTanaParentPaths,
} from './outliner';

const outliner: Value = [
  { children: [{ text: 'Parent' }], id: 'parent', type: 'p' },
  { children: [{ text: 'Child' }], id: 'child', indent: 1, type: 'p' },
  { children: [{ text: 'Sibling' }], id: 'sibling', type: 'p' },
];

describe('Tana outliner behavior', () => {
  test('uses the same top-level node boundary as Plate Block Selection', () => {
    assert.equal(isTanaNodeElement(outliner[0], [0]), true);
    assert.equal(isTanaNodeElement(outliner[1], [0, 0]), false);
    assert.equal(
      isTanaNodeElement(
        { children: [{ text: '' }], id: 'table', type: 'table' },
        [3]
      ),
      false
    );
  });

  test('promotes an ordinary parent and lets Plate Toggle hide descendants', () => {
    assert.deepEqual(getTanaParentPaths(outliner), [[0]]);
    assert.deepEqual(getOrdinaryTanaParentPaths(outliner), [[0]]);

    const withToggle = structuredClone(outliner);
    withToggle[0].type = 'toggle';

    assert.deepEqual(
      findElementIdsHiddenInToggle(new Set(), withToggle as never),
      ['child']
    );
    assert.deepEqual(
      findElementIdsHiddenInToggle(new Set(['parent']), withToggle as never),
      []
    );
  });
});
