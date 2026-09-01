import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
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

describe('Tana Field presentation', () => {
  test('hides a real Field occurrence by its NodeId without changing value Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const fields = editor.getTransforms(TanaFieldPlugin).field;

    const fieldNodeId = fields.materialize('task', 'status')!;
    fields.setValue('task', 'status', { type: 'plain', value: '进行中' });
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesById.get(fieldNodeId)
      ?.valueNodeId;
    const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;

    assert.equal(presentation.setFieldVisible('task', fieldNodeId, false), true);
    assert.deepEqual(editor.children[0].tanaPresentation, {
      hiddenFieldNodeIds: [fieldNodeId],
    });
    assert.equal(
      buildTanaIndex(editor.children).fieldNodesById.get(fieldNodeId)?.valueNodeId,
      valueNodeId
    );
    assert.deepEqual(buildTanaIndex(editor.children).fieldValues.get('task'), new Map([
      ['status', { type: 'plain', value: '进行中' }],
    ]));

    assert.equal(presentation.setFieldVisible('task', fieldNodeId, true), true);
    assert.equal(editor.children[0].tanaPresentation, undefined);
  });

  test('rejects a non-Field Node as a presentation target', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Other' }], id: 'other', type: KEYS.p },
    ]);

    assert.equal(
      editor
        .getTransforms(TanaPresentationPlugin)
        .presentation.setFieldVisible('task', 'other', false),
      false
    );
    assert.equal(editor.children[0].tanaPresentation, undefined);
  });
});
