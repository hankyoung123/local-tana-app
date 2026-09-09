import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';

import { getSelectedCanonicalSupertagIds } from './block-context-menu';

function createEditor(value: Value) {
  let nextId = 0;

  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      idCreator: () => `context-menu-test-${++nextId}`,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value,
  });
}

test('Reference-only bulk remove candidates resolve canonical memberships and stay atomic', () => {
  const editor = createEditor([
    { children: [{ text: 'Tag A' }], id: 'tag-a', tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'Tag B' }], id: 'tag-b', tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'Shared' }], id: 'shared', tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'A' }], id: 'a', tanaSupertagIds: ['tag-a', 'shared'], type: KEYS.p },
    { children: [{ text: 'B' }], id: 'b', tanaSupertagIds: ['tag-b', 'shared'], type: KEYS.p },
    { children: [{ text: 'A occurrence' }], id: 'ref-a', tanaReferenceTargetId: 'a', type: KEYS.p },
    { children: [{ text: 'B occurrence' }], id: 'ref-b', tanaReferenceTargetId: 'b', type: KEYS.p },
  ]);
  const selectedReferences = ['ref-a', 'ref-b', 'ref-a'];

  assert.deepEqual(
    getSelectedCanonicalSupertagIds(buildTanaIndex(editor.children), selectedReferences),
    ['tag-a', 'shared', 'tag-b']
  );

  const before = structuredClone(editor.children);
  const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

  assert.equal(supertag.removeMany(selectedReferences, 'shared'), true);
  assert.deepEqual((editor.children.find((node) => node.id === 'a') as TElement).tanaSupertagIds, ['tag-a']);
  assert.deepEqual((editor.children.find((node) => node.id === 'b') as TElement).tanaSupertagIds, ['tag-b']);
  assert.equal((editor.children.find((node) => node.id === 'ref-a') as TElement).tanaSupertagIds, undefined);
  assert.equal((editor.children.find((node) => node.id === 'ref-b') as TElement).tanaSupertagIds, undefined);

  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual((editor.children.find((node) => node.id === 'a') as TElement).tanaSupertagIds, ['tag-a']);
  assert.deepEqual((editor.children.find((node) => node.id === 'b') as TElement).tanaSupertagIds, ['tag-b']);
});
