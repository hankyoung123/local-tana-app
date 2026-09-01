import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';

import { TanaPresentationPlugin } from './tana-presentation-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('Tana field presentation', () => {
  test('hides and restores a Field row without changing any Field semantics', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: { status: { type: 'plain', value: '进行中' } },
        type: KEYS.p,
      },
    ]);
    const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;
    const fieldValues = structuredClone(editor.children[1].tanaFieldValues);

    assert.equal(presentation.setFieldVisible('task', 'status', false), true);
    assert.deepEqual(editor.children[1].tanaPresentation, {
      hiddenFieldKeys: ['status'],
    });
    assert.deepEqual(editor.children[1].tanaFieldValues, fieldValues);
    assert.deepEqual(buildTanaIndex(editor.children).fieldValues.get('task'), new Map([
      ['status', { type: 'plain', value: '进行中' }],
    ]));

    assert.equal(presentation.setFieldVisible('task', 'status', true), true);
    assert.equal(editor.children[1].tanaPresentation, undefined);
    assert.deepEqual(editor.children[1].tanaFieldValues, fieldValues);
  });

  test('does not create presentation metadata for an already visible Field', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(
      editor
        .getTransforms(TanaPresentationPlugin)
        .presentation.setFieldVisible('task', 'status', true),
      false
    );
    assert.equal(editor.children[0].tanaPresentation, undefined);
  });
});
