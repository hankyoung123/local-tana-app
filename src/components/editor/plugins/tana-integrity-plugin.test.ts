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

  test('removes an Options binding default when its target Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {
          fields: [
            {
              defaultValue: { type: 'options', value: 'active' },
              fieldId: 'status',
            },
          ],
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { options: ['active'], type: 'options' },
        type: KEYS.p,
      },
      { children: [{ text: 'Active' }], id: 'active', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [2] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId: 'status' }],
    });
  });

  test('removes a From Supertag binding default when its target Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {
          fields: [
            {
              defaultValue: { type: 'from-supertag', value: 'ada' },
              fieldId: 'owner',
            },
          ],
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' },
        type: KEYS.p,
      },
      { children: [{ text: 'Ada' }], id: 'ada', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [2] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId: 'owner' }],
    });
  });

  test('clears a From Supertag source when its Supertag Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      sourceSupertagId: null,
      type: 'from-supertag',
    });
  });

  test('removes a View Field clause when its Field Definition is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Open tasks' }],
        id: 'view',
        tanaViewDefinition: {
          clauses: [
            { fieldId: 'status', kind: 'field-defined' },
            { fieldId: 'status', kind: 'field-exists' },
            {
              fieldId: 'status',
              kind: 'field-equals',
              value: { type: 'plain', value: 'Open' },
            },
            { kind: 'text-contains', text: 'open' },
          ],
        },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].tanaViewDefinition, {
      clauses: [{ kind: 'text-contains', text: 'open' }],
    });
  });

  test('removes a View Supertag clause when its Supertag Node is deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project tasks' }],
        id: 'view',
        tanaViewDefinition: {
          clauses: [
            { kind: 'has-supertag', supertagId: 'project' },
            { kind: 'text-contains', text: 'task' },
          ],
        },
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].tanaViewDefinition, {
      clauses: [{ kind: 'text-contains', text: 'task' }],
    });
  });

  test('removes View equality clauses when Options or From Supertag targets are deleted', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { options: ['active'], type: 'options' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: 'Active' }], id: 'active', type: KEYS.p },
      { children: [{ text: 'Ada' }], id: 'ada', type: KEYS.p },
      {
        children: [{ text: 'Assigned active tasks' }],
        id: 'view',
        tanaViewDefinition: {
          clauses: [
            {
              fieldId: 'status',
              kind: 'field-equals',
              value: { type: 'options', value: 'active' },
            },
            {
              fieldId: 'owner',
              kind: 'field-equals',
              value: { type: 'from-supertag', value: 'ada' },
            },
            { kind: 'text-contains', text: 'task' },
          ],
        },
        type: KEYS.p,
      },
    ]);

    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: [4] });
      editor.tf.removeNodes({ at: [3] });
    });

    assert.deepEqual(editor.children[3].tanaViewDefinition, {
      clauses: [{ kind: 'text-contains', text: 'task' }],
    });
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
