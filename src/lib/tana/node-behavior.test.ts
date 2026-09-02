import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';

import {
  canDrag,
  canDrop,
} from './node-behavior';

const document: Value = [
  { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
  {
    children: [{ text: 'Status' }],
    id: 'status',
    tanaFieldDefinition: { type: 'plain' },
    type: KEYS.p,
  },
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
    tanaFieldValueType: 'plain',
    type: KEYS.p,
  },
];

function nodeAt(path: number[]): TElement {
  return document[path[0]] as TElement;
}

describe('Node behavior runtime', () => {
  test('expresses Field and Value interaction constraints without an interaction store', () => {
    assert.equal(canDrag(nodeAt([2]), { document, path: [2] }), true);
    assert.equal(canDrag(nodeAt([3]), { document, path: [3] }), false);
    assert.equal(
      canDrop(
        nodeAt([0]),
        nodeAt([2]),
        { document, path: [0] },
        { document, path: [2] }
      ),
      false
    );
    assert.equal(
      canDrop(
        nodeAt([3]),
        nodeAt([0]),
        { document, path: [3] },
        { document, path: [0] }
      ),
      false
    );
    assert.equal(
      canDrop(
        nodeAt([2]),
        nodeAt([0]),
        { document, path: [2] },
        { document, path: [0] }
      ),
      true
    );
    assert.equal(
      canDrop(
        nodeAt([2]),
        nodeAt([1]),
        { document, path: [2] },
        { document, path: [1] }
      ),
      false
    );
    assert.equal(
      canDrop(
        nodeAt([0]),
        nodeAt([3]),
        { document, path: [0] },
        { document, path: [3] }
      ),
      false
    );
  });

});
