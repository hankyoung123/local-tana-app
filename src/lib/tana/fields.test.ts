import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';

import { isTanaNodeElement } from './constants';
import {
  getNodeFieldDescriptors,
  isAdHocFieldInputNode,
  isFieldDefined,
  isFieldSet,
  isFieldValueCompatible,
  isSupertagFieldInputNode,
  getFieldValueCandidates,
} from './fields';
import { buildTanaIndex } from './index';

globalThis.requestAnimationFrame ??= () => 0;

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

function field(editor: ReturnType<typeof createEditor>) {
  return editor.getTransforms(TanaFieldPlugin).field;
}

describe('Field occurrence Nodes', () => {
  test('materializes a normal Field Node and a typed value child without a parent map', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
    ]);

    const occurrenceId = field(editor).materialize('task', 'estimate');
    const index = buildTanaIndex(editor.children);
    const occurrence = occurrenceId
      ? index.fieldNodesById.get(occurrenceId)
      : undefined;

    assert.ok(occurrenceId);
    assert.equal(occurrence?.fieldId, 'estimate');
    assert.equal(occurrence?.parentNodeId, 'task');
    assert.ok(occurrence?.valueNodeId);
    assert.deepEqual(
      Object.keys(editor.children[0]).filter((key) => key.endsWith('Values')),
      []
    );
    assert.equal(isFieldDefined(index, 'task', 'estimate'), true);
    assert.equal(isFieldSet(index, 'task', 'estimate'), false);
  });

  test('writes and clears Field values on the value child while preserving its NodeId', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
    ]);

    field(editor).materialize('task', 'estimate');
    const before = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0];

    assert.equal(
      field(editor).setValue('task', 'estimate', { type: 'number', value: 8 }),
      true
    );
    assert.deepEqual(buildTanaIndex(editor.children).fieldValues.get('task'), new Map([
      ['estimate', { type: 'number', value: 8 }],
    ]));
    assert.equal(field(editor).clearValue('task', 'estimate'), true);

    const after = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0];

    assert.equal(after.valueNodeId, before.valueNodeId);
    assert.equal(editor.children.length, 4);
    assert.equal(
      buildTanaIndex(editor.children).fieldValues.get('task')?.has('estimate') ??
        false,
      false
    );
  });

  test('rejects invalid Field writes without changing the document', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'options' },
        type: KEYS.p,
      },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
      { children: [{ text: 'Other' }], id: 'other', type: KEYS.p },
    ]);

    field(editor).materialize('task', 'status');
    const before = structuredClone(editor.children);

    assert.equal(
      field(editor).setValue('task', 'status', {
        type: 'options',
        value: 'other',
      }),
      false
    );
    assert.deepEqual(editor.children, before);
  });

  test('derives Options candidates from ordered direct child Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Todo' }], id: 'todo', indent: 1, type: KEYS.p },
      { children: [{ text: 'Doing' }], id: 'doing', indent: 1, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.deepEqual(
      getFieldValueCandidates(buildTanaIndex(editor.children), 'status').map(({ id }) => id),
      ['todo', 'doing']
    );
    const doneId = field(editor).createOption('status', 'Done');
    assert.ok(doneId);
    assert.deepEqual(
      getFieldValueCandidates(buildTanaIndex(editor.children), 'status').map(({ id }) => id),
      ['todo', 'doing', doneId]
    );
    assert.equal(field(editor).removeOption('status', 'todo'), true);
    assert.deepEqual(
      getFieldValueCandidates(buildTanaIndex(editor.children), 'status').map(({ id }) => id),
      ['doing', doneId]
    );
    assert.deepEqual(editor.children[0].tanaFieldDefinition, { type: 'options' });
  });

  test('refuses to materialize a Field below Field or Value structure', () => {
    const editor = createEditor([
      { children: [{ text: 'Priority' }], id: 'priority', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    const occurrenceId = field(editor).materialize('task', 'priority');
    assert.ok(occurrenceId);
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesById.get(occurrenceId)
      ?.valueNodeId;
    assert.ok(valueNodeId);

    assert.equal(field(editor).materialize('priority', 'priority'), undefined);
    assert.equal(field(editor).materialize(occurrenceId, 'priority'), undefined);
    assert.equal(field(editor).materialize(valueNodeId, 'priority'), undefined);
  });

  test('uses the transient blank child itself as the ad-hoc Field occurrence', () => {
    const editor = createEditor([
      { children: [{ text: 'Priority' }], id: 'priority', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'temporary', indent: 1, type: KEYS.p },
    ]);

    assert.equal(isAdHocFieldInputNode(editor.children, [2]), true);
    assert.equal(
      field(editor).completeAdHocInput('temporary', { fieldId: 'priority' }),
      'priority'
    );

    const occurrence = editor.children.find((node) => node.id === 'temporary');
    const index = buildTanaIndex(editor.children);

    assert.equal(occurrence?.tanaFieldId, 'priority');
    assert.equal(index.fieldNodesById.get('temporary')?.parentNodeId, 'task');
    assert.ok(index.fieldNodesById.get('temporary')?.valueNodeId);
  });

  test('turns a transient Supertag child into a real template Field Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-input', indent: 1, type: KEYS.p },
    ]);

    assert.equal(isSupertagFieldInputNode(editor.children, [1]), true);
    const fieldId = field(editor).completeTemplateInput('template-input', 'project', {
      name: 'Priority',
      type: 'create',
    });
    const definition = fieldId
      ? buildTanaIndex(editor.children).nodesById.get(fieldId)
      : undefined;

    assert.ok(fieldId);
    assert.equal(definition?.fieldDefinition?.type, 'plain');
    assert.equal(definition?.node.indent, undefined);
    assert.equal(editor.children.find((node) => node.id === 'template-input')?.tanaFieldId, fieldId);
    assert.equal(
      buildTanaIndex(editor.children).fieldNodesById.get('template-input')
        ?.parentNodeId,
      'project'
    );
    assert.equal(isSupertagFieldInputNode(editor.children, [1]), false);
  });

  test('materializes every template Field when applying a Supertag and keeps Field labels dynamic', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-title', indent: 1, tanaFieldId: 'title', type: KEYS.p },
      { children: [{ text: 'Untitled' }], id: 'template-title-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-estimate', indent: 1, tanaFieldId: 'estimate', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-estimate-value', indent: 2, tanaFieldValueType: 'number', type: KEYS.p },
      { children: [{ text: 'Title' }], id: 'title', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Estimate' }], id: 'estimate', tanaFieldDefinition: { type: 'number' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(
      editor.getTransforms(TanaSupertagPlugin).supertag.apply('task', 'project'),
      true
    );

    const index = buildTanaIndex(editor.children);
    const fields = index.fieldNodesByParent.get('task') ?? [];
    const descriptors = getNodeFieldDescriptors(index, 'task');

    assert.deepEqual(fields.map(({ fieldId }) => fieldId), ['title', 'estimate']);
    assert.deepEqual(index.fieldValues.get('task'), new Map([
      ['title', { type: 'plain', value: 'Untitled' }],
    ]));
    assert.deepEqual(
      descriptors.filter((descriptor) => descriptor.source !== 'system').map(
        ({ fieldNodeId, key, label }) => ({ fieldNodeId, key, label })
      ),
      fields.map((fieldNode) => ({
        fieldNodeId: fieldNode.id,
        key: fieldNode.id,
        label: index.nodesById.get(fieldNode.fieldId)?.text,
      }))
    );
  });

  test('keeps compatibility a pure type check', () => {
    assert.equal(
      isFieldValueCompatible({ type: 'number' }, { type: 'plain', value: '1' }),
      false
    );
    assert.equal(
      isFieldValueCompatible({ type: 'number' }, { type: 'number', value: 1 }),
      true
    );
  });
});
