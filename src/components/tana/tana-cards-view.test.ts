import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { buildTanaIndex } from '@/lib/tana';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { isValidTanaDocument } from '@/lib/tana/persistence';

import { applyTanaCardsGroupDrop } from './tana-cards-view';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('Tana Cards View', () => {
  test('moves a Reference card between a concrete group by writing its canonical Field', () => {
    const editor = createEditor([
      { children: [{ text: 'State' }], id: 'state', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: '' }], id: 'target-state', indent: 1, tanaFieldId: 'state', type: KEYS.p },
      { children: [{ text: 'todo' }], id: 'target-state-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ]);

    assert.equal(applyTanaCardsGroupDrop(editor, 'reference', 'state', { type: 'plain', value: 'done' }), true);
    assert.equal(applyTanaCardsGroupDrop(editor, 'reference', 'state', undefined), false);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('target')?.[0]?.values, [{ type: 'plain', value: 'done' }]);
    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.has('reference'), false);
  });

  test('materializes an absent canonical group Field once, keeps Reference occurrences empty, and undo/redo restores one drop', () => {
    const editor = createEditor([
      { children: [{ text: 'State' }], id: 'state', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ]);

    assert.equal(applyTanaCardsGroupDrop(editor, 'reference', 'state', { type: 'plain', value: 'done' }), true);
    let index = buildTanaIndex(editor.children);
    assert.deepEqual(index.fieldNodesByParent.get('target')?.[0]?.values, [{ type: 'plain', value: 'done' }]);
    assert.equal(index.fieldNodesByParent.has('reference'), false);

    editor.tf.undo();
    index = buildTanaIndex(editor.children);
    assert.equal(index.fieldNodesByParent.has('target'), false);
    assert.equal(index.fieldNodesByParent.has('reference'), false);

    editor.tf.redo();
    index = buildTanaIndex(editor.children);
    assert.deepEqual(index.fieldNodesByParent.get('target')?.[0]?.values, [{ type: 'plain', value: 'done' }]);
    assert.equal(index.fieldNodesByParent.has('reference'), false);
  });

  test('materializes an absent Field for a canonical Card and rejects an undefined group target', () => {
    const editor = createEditor([
      { children: [{ text: 'State' }], id: 'state', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
    ]);

    assert.equal(applyTanaCardsGroupDrop(editor, 'target', 'state', undefined), false);
    assert.equal(applyTanaCardsGroupDrop(editor, 'target', 'state', { type: 'plain', value: 'doing' }), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('target')?.[0]?.values, [{ type: 'plain', value: 'doing' }]);
    // The transform writes ordinary Field/Value Nodes, so the resulting fragment
    // remains valid once mounted under the existing workspace skeleton.
    const workspace = [
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
      ...structuredClone(editor.children).map((node) => ({ ...node, indent: ((node as { indent?: number }).indent ?? 0) + 1 })),
    ];
    assert.equal(isValidTanaDocument(workspace), true);
  });
});
