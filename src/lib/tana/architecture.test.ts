import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';

import { isTanaNodeElement } from './constants';

globalThis.requestAnimationFrame ??= () => 0;

function createEditor(value: Value) {
  let nextId = 0;

  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      idCreator: () => `node-${++nextId}`,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value,
  });
}

describe('architecture freeze baseline', () => {
  test('keeps Plate NodeIds stable through ordinary split, reorder, and merge', () => {
    const editor = createEditor([
      { children: [{ text: 'Alpha' }], id: 'alpha', type: KEYS.p },
      { children: [{ text: 'Beta' }], id: 'beta', type: KEYS.p },
    ]);

    editor.tf.select({
      anchor: { offset: 2, path: [0, 0] },
      focus: { offset: 2, path: [0, 0] },
    });
    editor.tf.insertBreak();

    const splitId = editor.children[1].id as string;

    assert.equal(editor.children[0].id, 'alpha');
    assert.notEqual(splitId, 'alpha');
    assert.notEqual(splitId, 'beta');

    editor.tf.moveNodes({ at: [1], to: [0] });

    assert.equal(editor.children[0].id, splitId);
    assert.equal(editor.children[1].id, 'alpha');

    editor.tf.select({
      anchor: { offset: 0, path: [1, 0] },
      focus: { offset: 0, path: [1, 0] },
    });
    editor.tf.deleteBackward('character');

    assert.equal(editor.children[0].id, splitId);
    assert.equal(editor.children.some((node) => node.id === 'alpha'), false);
  });

  test('moves a flat-indent Node subtree as one stable Plate document range', () => {
    const editor = createEditor([
      { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
      { children: [{ text: 'C' }], id: 'c', indent: 2, type: KEYS.p },
      { children: [{ text: 'D' }], id: 'd', type: KEYS.p },
    ]);

    editor.tf.moveNodes({ at: [0], to: [4] });

    assert.deepEqual(
      editor.children.map(({ id, indent }) => ({ id, indent })),
      [
        { id: 'd', indent: undefined },
        { id: 'a', indent: undefined },
        { id: 'b', indent: 1 },
        { id: 'c', indent: 2 },
      ]
    );
  });

  test('makes the right side of an ordinary split a fresh semantic-free Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Source' }],
        id: 'source',
        tanaFieldDefinition: { type: 'plain' },
        tanaPresentation: { hiddenFieldNodeIds: ['field'] },
        tanaReferenceTargetId: 'target',
        tanaSearchDefinition: { query: { children: [], type: 'and' } },
        tanaSupertagDefinition: {},
        tanaSupertagIds: ['tag'],
        tanaViewDefinition: { type: 'outline' },
        type: KEYS.p,
      },
    ]);

    editor.tf.select({
      anchor: { offset: 3, path: [0, 0] },
      focus: { offset: 3, path: [0, 0] },
    });
    editor.tf.insertBreak();

    assert.equal(editor.children[0].id, 'source');
    assert.notEqual(editor.children[1].id, 'source');
    assert.deepEqual(
      Object.keys(editor.children[1]).filter((key) => key.startsWith('tana')),
      []
    );
  });
});
