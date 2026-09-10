import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { buildTanaIndex } from '@/lib/tana';
import { isTanaNodeElement } from '@/lib/tana/constants';

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
});
