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
  test('repairs an invalid Supertag definition without changing its Node identity', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', type: KEYS.p },
    ]);

    editor.tf.setNodes(
      { tanaSupertagDefinition: [] as never },
      { at: [0] }
    );

    assert.equal(editor.children[0].id, 'project');
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {});
  });

  test('repairs malformed View presentation without changing Search ownership', () => {
    const editor = createEditor([
      { children: [{ text: 'Open tasks' }], id: 'view', type: KEYS.p },
    ]);

    editor.tf.setNodes(
      { tanaViewDefinition: { type: 'table' as never } },
      { at: [0] }
    );

    assert.equal(editor.children[0].id, 'view');
    assert.deepEqual(editor.children[0].tanaViewDefinition, { type: 'outline' });
  });

  test('removes dangling inline references and supertags', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: KEYS.p },
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

  test('clears a dangling block-level Reference target while retaining its Node', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', type: KEYS.p },
      {
        children: [{ text: 'Project reference' }],
        id: 'project-reference',
        tanaReferenceTargetId: 'project',
        type: KEYS.p,
      },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.equal(editor.children[0].id, 'project-reference');
    assert.equal(editor.children[0].tanaReferenceTargetId, undefined);
  });

  test('keeps Field occurrence Nodes when their Definition Node is deleted', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'template-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Open' }], id: 'task-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [0] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {});
    assert.equal(editor.children.some((node) => node.id === 'template-status'), true);
    assert.equal(editor.children.some((node) => node.id === 'template-status-value'), true);
    assert.equal(editor.children.some((node) => node.id === 'task-status'), true);
    assert.equal(editor.children.some((node) => node.id === 'task-status-value'), true);
    assert.equal(
      buildTanaIndex(editor.children).fieldNodesById.get('task-status')
        ?.brokenFieldDefinition,
      true
    );
  });

  test('clears a dangling Options value through its ordinary value Node', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
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

    assert.deepEqual(editor.children[0].tanaFieldDefinition, { type: 'options' });
    assert.equal(
      buildTanaIndex(editor.children).fieldValues.get('task')?.has('status') ?? false,
      false
    );
  });

  test('clears a dangling template Value Node relation without deleting its Field Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [relation(KEYS.mention, 'active')],
        id: 'template-status-value',
        indent: 2,
        tanaFieldValueType: 'options',
        type: KEYS.p,
      },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [4] });

    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {});
    assert.deepEqual(
      editor.children.find((node) => node.id === 'template-status-value')?.children,
      [{ text: '' }]
    );
  });

  test('nulls a deleted From-Supertag source without deleting the Field Definition', () => {
    const editor = createEditor([
      { children: [{ text: 'Owner' }], id: 'owner', tanaFieldDefinition: { sourceSupertagId: 'project', type: 'from-supertag' }, type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [1] });

    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      sourceSupertagId: null,
      type: 'from-supertag',
    });
  });

  test('allows Field occurrences to retain zero or multiple direct Value Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Priority' }], id: 'priority', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-priority', indent: 1, tanaFieldId: 'priority', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-priority-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    ]);

    editor.tf.removeNodes({ at: [3] });
    assert.equal(editor.children.some((node) => node.id === 'task-priority'), true);
    assert.equal(editor.children.filter((node) => node.tanaFieldValueType === 'plain').length, 0);

    editor.tf.insertNodes(
      { children: [{ text: 'duplicate' }], id: 'duplicate-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { at: [3] }
    );
    editor.tf.insertNodes(
      { children: [{ text: 'another' }], id: 'another-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { at: [4] }
    );
    assert.equal(
      editor.children.filter((node) => node.tanaFieldValueType === 'plain').length,
      2
    );
    assert.equal(
      editor.children.find((node) => node.id === 'duplicate-value')?.tanaFieldValueType,
      'plain'
    );
  });

  test('keeps a Field occurrence whose Definition relation is temporarily broken', () => {
    const editor = createEditor([
      { children: [{ text: 'Not a field' }], id: 'not-definition', type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'invalid-field', indent: 1, tanaFieldId: 'not-definition', type: KEYS.p },
      { children: [{ text: '' }], id: 'invalid-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    ]);

    editor.tf.setNodes({ type: KEYS.h1 }, { at: [1] });

    assert.equal(editor.children.some((node) => node.id === 'invalid-field'), true);
    assert.equal(editor.children.some((node) => node.id === 'invalid-value'), true);
    assert.equal(
      buildTanaIndex(editor.children).fieldNodesById.get('invalid-field')
        ?.brokenFieldDefinition,
      true
    );
  });

  test('prunes dangling View clauses while retaining unrelated clauses', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Open tasks' }],
        id: 'view',
        tanaSearchDefinition: {
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

    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      clauses: [{ kind: 'text-contains', text: 'open' }],
    });
  });
});
