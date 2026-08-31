import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement, TANA_SUPERTAG_KEY } from '@/lib/tana/constants';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value,
  });
}

function relation(type: string, key: string): TElement {
  return { children: [{ text: '' }], key, type };
}

describe('Tana integrity normalization', () => {
  test('removes a Mention when its referenced Node is deleted', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', type: KEYS.p },
      {
        children: [{ text: 'Ship ' }, relation(KEYS.mention, 'project')],
        id: 'task',
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].children, [{ text: 'Ship ' }]);
  });

  test('removes an inline Supertag when its definition Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Ship ' }, relation(TANA_SUPERTAG_KEY, 'project')],
        id: 'task',
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].children, [{ text: 'Ship ' }]);
  });

  test('removes bindings and direct Field keys when a Field Definition is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'status' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: { status: { type: 'plain', value: 'Active' } },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, { fields: [] });
    assert.equal('tanaFieldValues' in editor.children[1], false);
  });

  test('clears an Options FieldValue and prunes options when its option Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { options: ['active'], type: 'options' },
        type: KEYS.p,
      },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: { status: { type: 'options', value: 'active' } },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      options: [],
      type: 'options',
    });
    assert.deepEqual(editor.children[1].tanaFieldValues, { status: null });
  });

  test('clears a From Supertag FieldValue when its target Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' },
        type: KEYS.p,
      },
      { children: [{ text: 'Ada' }], id: 'ada', type: KEYS.p },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: { owner: { type: 'from-supertag', value: 'ada' } },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [2] });

    assert.deepEqual(editor.children[2].tanaFieldValues, { owner: null });
  });

  test('repairs relations to descendants after a parent subtree is removed', () => {
    const editor = createEditor([
      { children: [{ text: 'Parent' }], id: 'parent', type: KEYS.p },
      { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'child' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: { child: { type: 'plain', value: 'kept' } },
        type: KEYS.p,
      },
    ]);

    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: [1] });
      editor.tf.removeNodes({ at: [0] });
    });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, { fields: [] });
    assert.equal('tanaFieldValues' in editor.children[1], false);
  });
});
