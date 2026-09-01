import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement, TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

function relation(type: string, key: string): TElement {
  return { children: [{ text: '' }], key, type };
}

describe('Tana relation integrity', () => {
  test('removes dangling inline references and supertags', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: { fields: [] }, type: KEYS.p },
      {
        children: [
          { text: 'Ship ' },
          relation(KEYS.mention, 'project'),
          relation(TANA_SUPERTAG_KEY, 'project'),
        ],
        id: 'task',
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].children, [{ text: 'Ship ' }]);
  });

  test('removes Field occurrences and bindings when their Definition Node is deleted', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: { fields: [{ fieldId: 'status' }] }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Open' }], id: 'task-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, { fields: [] });
    assert.equal(editor.children.some((node) => node.id === 'task-status'), false);
    assert.equal(editor.children.some((node) => node.id === 'task-status-value'), false);
  });

  test('clears a dangling Options value through its ordinary value Node', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { options: ['active'], type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [relation(KEYS.mention, 'active')],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'options',
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      options: [],
      type: 'options',
    });
    assert.equal(
      buildTanaIndex(editor.children).fieldValues.get('task')?.has('status') ?? false,
      false
    );
  });

  test('removes dangling binding defaults but keeps their binding', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {
          fields: [{ defaultValue: { type: 'options', value: 'active' }, fieldId: 'status' }],
        },
        type: KEYS.p,
      },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { options: ['active'], type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Active' }], id: 'active', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [2] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId: 'status' }],
    });
  });

  test('nulls a deleted From-Supertag source without deleting the Field Definition', () => {
    const editor = createEditor([
      { children: [{ text: 'Owner' }], id: 'owner', tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' }, type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: { fields: [] }, type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      sourceSupertagId: null,
      type: 'from-supertag',
    });
  });

  test('prunes dangling View clauses while retaining unrelated clauses', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { options: ['active'], type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Active' }], id: 'active', type: KEYS.p },
      {
        children: [{ text: 'Open tasks' }],
        id: 'view',
        tanaViewDefinition: {
          clauses: [
            { fieldId: 'status', kind: 'field-defined' },
            { fieldId: 'status', kind: 'field-equals', value: { type: 'options', value: 'active' } },
            { kind: 'text-contains', text: 'open' },
          ],
        },
        type: KEYS.p,
      },
    ]);

    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: [1] });
      editor.tf.removeNodes({ at: [0] });
    });

    assert.deepEqual(editor.children[0].tanaViewDefinition, {
      clauses: [{ kind: 'text-contains', text: 'open' }],
    });
  });
});
