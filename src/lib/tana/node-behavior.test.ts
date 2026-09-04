import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';

import {
  canDuplicate,
  canDrag,
  canDrop,
  canIndent,
  canOutdent,
  canSelect,
  canTrash,
  canTurnInto,
  canUseSlashCommand,
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

  test('keeps generic actions on ordinary Nodes and away from protected semantics', () => {
    const system = {
      children: [{ text: 'Workspace' }],
      id: 'workspace',
      tanaSystemNode: 'workspace',
      type: KEYS.p,
    } as TElement;
    const reference = {
      children: [{ text: 'Task reference' }],
      id: 'reference',
      tanaReferenceTargetId: 'task',
      type: KEYS.p,
    } as TElement;

    assert.equal(canSelect(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canSelect(nodeAt([2]), { document, path: [2] }), false);
    assert.equal(canSelect(nodeAt([3]), { document, path: [3] }), false);
    assert.equal(canSelect(system), false);

    assert.equal(canDuplicate(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canDuplicate(reference), true);
    assert.equal(canDuplicate(nodeAt([3]), { document, path: [3] }), false);
    assert.equal(canDuplicate(system), false);

    assert.equal(canIndent(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canOutdent(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canIndent(nodeAt([2]), { document, path: [2] }), false);
    assert.equal(canOutdent(system), false);

    assert.equal(canTurnInto(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canTurnInto(nodeAt([2]), { document, path: [2] }), false);
    assert.equal(canTurnInto(system), false);
    assert.equal(canTrash(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canTrash(nodeAt([3]), { document, path: [3] }), false);
    assert.equal(canUseSlashCommand(nodeAt([0]), { document, path: [0] }), true);
    assert.equal(canUseSlashCommand(nodeAt([2]), { document, path: [2] }), false);
  });

});
