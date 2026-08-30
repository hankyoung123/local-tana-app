import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';
import {
  bindFieldToSupertag,
  createFieldDefinition,
  getFieldValueCandidates,
  getSupertagFieldBindings,
} from './fields';
import { buildTanaIndex } from './index';
import { applySupertag } from './supertag';

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

describe('Tana field nodes', () => {
  test('uses the Plate NodeId for a Field Definition and Supertag binding', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
    ]);

    const fieldId = createFieldDefinition(editor, 'Summary', { type: 'plain' });

    assert.equal(fieldId, 'node-1');
    assert.equal(editor.children[1].id, fieldId);
    assert.deepEqual(editor.children[1].tanaFieldDefinition, { type: 'plain' });
    assert.equal(bindFieldToSupertag(editor, 'project', fieldId!), true);
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId }],
    });
  });

  test('resolves field names from the current Field Definition node text', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'owner' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
    ]);

    assert.equal(
      getSupertagFieldBindings(buildTanaIndex(editor.children), 'project')[0]
        ?.field.text,
      'Owner'
    );

    editor.tf.select([1, 0], { edge: 'end' });
    editor.tf.insertText(' name');

    assert.equal(
      getSupertagFieldBindings(buildTanaIndex(editor.children), 'project')[0]
        ?.field.text,
      'Owner name'
    );
  });

  test('keeps a binding without an explicit default unset when applied', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'priority' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(applySupertag(editor, 'task', 'project'), true);
    assert.equal(editor.children[2].tanaFieldValues, undefined);
  });

  test('derives From Supertag candidates only from the source tag instances', () => {
    const index = buildTanaIndex([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Person' }],
        id: 'person',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: {
          sourceSupertagId: 'person',
          type: 'from-supertag',
        },
        type: KEYS.p,
      },
      {
        children: [
          { text: 'Ada ' },
          { children: [{ text: '' }], key: 'person', type: 'tana_supertag' },
        ],
        id: 'ada',
        type: KEYS.p,
      },
      {
        children: [
          { text: 'Build ' },
          { children: [{ text: '' }], key: 'project', type: 'tana_supertag' },
        ],
        id: 'build',
        type: KEYS.p,
      },
    ]);

    const owner = index.nodesById.get('owner')!.fieldDefinition!;

    assert.deepEqual(
      getFieldValueCandidates(index, owner).map(({ id }) => id),
      ['ada']
    );
  });
});
