import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';

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
  isFieldValueValid,
  isSupertagFieldInputNode,
  getFieldValueCandidates
} from './fields';
import { buildTanaIndex } from './index';
import { getTanaNodePath, isTanaNodeInteractable } from './outliner';

globalThis.requestAnimationFrame ??= () => 0;

function createEditor(value: Value) {
  let nextId = 0;

  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      idCreator: () => `node-${++nextId}`,
      initialValueIds: 'always'
    },
    plugins: EditorKit,
    value
  });
}

function field(editor: ReturnType<typeof createEditor>) {
  return editor.getTransforms(TanaFieldPlugin).field;
}

describe('Field occurrence Nodes', () => {
  test('keeps Field and Value Nodes structurally atomic while ordinary Nodes use Plate transforms', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      },
      {
        children: [{ text: 'SQLite 在本地持久化文档。' }],
        id: 'sqlite',
        type: KEYS.p
      }
    ]);

    const occurrenceId = field(editor).materialize('task', 'estimate');
    assert.ok(occurrenceId);
    assert.equal(field(editor).setValue('task', 'estimate', { type: 'plain', value: '8' }), true);

    const beforeFieldEditing = structuredClone(editor.children);

    // Field: Enter cannot split it or merge its Value child.
    editor.tf.select({
      anchor: { offset: 0, path: [1, 0] },
      focus: { offset: 0, path: [1, 0] }
    });
    editor.tf.insertBreak();
    editor.tf.deleteBackward('character');
    editor.tf.deleteForward('character');
    assert.deepEqual(editor.children, beforeFieldEditing);

    // Value: Enter cannot create a second Value; edge deletion cannot merge
    // the Value with its Field or the following ordinary Node.
    editor.tf.select({
      anchor: { offset: 0, path: [2, 0] },
      focus: { offset: 0, path: [2, 0] }
    });
    editor.tf.insertBreak();
    editor.tf.deleteBackward('character');
    assert.deepEqual(editor.children, beforeFieldEditing);

    editor.tf.select({
      anchor: { offset: 1, path: [2, 0] },
      focus: { offset: 1, path: [2, 0] }
    });
    editor.tf.deleteForward('character');
    assert.deepEqual(editor.children, beforeFieldEditing);

    const fieldIndent = editor.children[1].indent;
    const valueIndent = editor.children[2].indent;
    editor.tf.select({
      anchor: { offset: 0, path: [1, 0] },
      focus: { offset: 0, path: [1, 0] }
    });
    assert.equal(editor.tf.tab({ reverse: false }), true);
    assert.equal(editor.tf.tab({ reverse: true }), true);
    editor.tf.select({
      anchor: { offset: 0, path: [2, 0] },
      focus: { offset: 0, path: [2, 0] }
    });
    assert.equal(editor.tf.tab({ reverse: false }), true);
    assert.equal(editor.tf.tab({ reverse: true }), true);
    assert.equal(editor.children[1].indent, fieldIndent);
    assert.equal(editor.children[2].indent, valueIndent);

    // A normal block still receives Plate's unmodified structural behavior.
    editor.tf.select({
      anchor: { offset: 0, path: [4, 0] },
      focus: { offset: 0, path: [4, 0] }
    });
    editor.tf.insertBreak();
    assert.equal(editor.children.length, beforeFieldEditing.length + 1);

    // Editing Field structure cannot make a zoom-external sibling eligible
    // for interaction. The SQLite node is part of the source document, not
    // part of Task's Field subtree.
    assert.equal(isTanaNodeInteractable(editor.children, [5], new Set(), 'task'), false);

    const normalEditor = createEditor([
      { children: [{ text: 'First' }], id: 'first', type: KEYS.p },
      { children: [{ text: 'Second' }], id: 'second', type: KEYS.p }
    ]);
    normalEditor.tf.select({
      anchor: { offset: 0, path: [1, 0] },
      focus: { offset: 0, path: [1, 0] }
    });
    normalEditor.tf.deleteBackward('character');
    assert.equal(normalEditor.children.length, 1);
    assert.equal(normalEditor.children[0].children[0].text, 'FirstSecond');

    const normalTabEditor = createEditor([
      { children: [{ text: 'First' }], id: 'first', type: KEYS.p },
      { children: [{ text: 'Second' }], id: 'second', type: KEYS.p }
    ]);
    normalTabEditor.tf.select({
      anchor: { offset: 0, path: [1, 0] },
      focus: { offset: 0, path: [1, 0] }
    });
    assert.equal(normalTabEditor.tf.tab({ reverse: false }), true);
    assert.equal(normalTabEditor.children[1].indent, 1);
  });

  test('blocks expanded text deletion that crosses a Field subtree', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: '' }],
        id: 'task-status',
        indent: 1,
        tanaFieldId: 'status',
        type: KEYS.p
      },
      {
        children: [{ text: 'Ready' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p
      },
      { children: [{ text: 'Sibling' }], id: 'sibling', type: KEYS.p },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      }
    ]);
    const before = structuredClone(editor.children);

    editor.tf.select({
      anchor: { offset: 2, path: [0, 0] },
      focus: { offset: 3, path: [3, 0] }
    });
    editor.tf.deleteForward('character');
    assert.deepEqual(editor.children, before);

    editor.tf.select({
      anchor: { offset: 2, path: [0, 0] },
      focus: { offset: 3, path: [3, 0] }
    });
    editor.tf.deleteBackward('character');
    assert.deepEqual(editor.children, before);
    assert.deepEqual(
      buildTanaIndex(editor.children)
        .fieldNodesByParent.get('task')
        ?.map(({ id }) => id),
      ['task-status']
    );
  });

  test('deletes a block-selected Field together with its complete Value subtree', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: '' }],
        id: 'task-status',
        indent: 1,
        tanaFieldId: 'status',
        type: KEYS.p
      },
      {
        children: [{ text: 'Ready' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p
      },
      { children: [{ text: 'Sibling' }], id: 'sibling', type: KEYS.p },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      }
    ]);

    editor.getApi(BlockSelectionPlugin).blockSelection.set('task-status');
    editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();

    assert.equal(getTanaNodePath(editor.children, 'task-status'), undefined);
    assert.equal(getTanaNodePath(editor.children, 'task-status-value'), undefined);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task') ?? [], []);
  });

  test('materializes a normal Field Node and a typed value child without a parent map', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p
      }
    ]);

    const occurrenceId = field(editor).materialize('task', 'estimate');
    const index = buildTanaIndex(editor.children);
    const occurrence = occurrenceId ? index.fieldNodesById.get(occurrenceId) : undefined;

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
        type: KEYS.p
      }
    ]);

    field(editor).materialize('task', 'estimate');
    const before = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0];

    assert.equal(field(editor).setValue('task', 'estimate', { type: 'number', value: 8 }), true);
    assert.deepEqual(
      buildTanaIndex(editor.children).fieldValues.get('task'),
      new Map([['estimate', { type: 'number', value: 8 }]])
    );
    assert.equal(field(editor).clearValue('task', 'estimate'), true);

    const after = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0];

    assert.equal(after.valueNodeId, before.valueNodeId);
    assert.equal(editor.children.length, 4);
    assert.equal(
      buildTanaIndex(editor.children).fieldValues.get('task')?.has('estimate') ?? false,
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
        type: KEYS.p
      },
      { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
      { children: [{ text: 'Other' }], id: 'other', type: KEYS.p }
    ]);

    field(editor).materialize('task', 'status');
    const before = structuredClone(editor.children);

    assert.equal(
      field(editor).setValue('task', 'status', {
        type: 'options',
        value: 'other'
      }),
      false
    );
    assert.deepEqual(editor.children, before);
  });

  test('derives Options candidates from ordered direct child Nodes', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'options' },
        type: KEYS.p
      },
      { children: [{ text: 'Todo' }], id: 'todo', indent: 1, type: KEYS.p },
      { children: [{ text: 'Doing' }], id: 'doing', indent: 1, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p }
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
    assert.deepEqual(editor.children[0].tanaFieldDefinition, {
      type: 'options'
    });
  });

  test('refuses to materialize a Field below Field or Value structure', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p }
    ]);

    const occurrenceId = field(editor).materialize('task', 'priority');
    assert.ok(occurrenceId);
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesById.get(
      occurrenceId
    )?.valueNodeId;
    assert.ok(valueNodeId);

    assert.equal(field(editor).materialize('priority', 'priority'), undefined);
    assert.equal(field(editor).materialize(occurrenceId, 'priority'), undefined);
    assert.equal(field(editor).materialize(valueNodeId, 'priority'), undefined);
  });

  test('uses the transient blank child itself as the ad-hoc Field occurrence', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'temporary', indent: 1, type: KEYS.p }
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

  test('creates shared Definitions under Schema and local Definitions under the requested owner', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Schema' }],
        id: 'schema',
        tanaSystemNode: 'schema',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
    ]);
    const fields = field(editor);
    const sharedFieldId = fields.createDefinition('Status', { type: 'plain' });
    const localFieldId = fields.createDefinition('Priority', { type: 'number' }, 'project');
    const index = buildTanaIndex(editor.children);

    assert.ok(sharedFieldId);
    assert.ok(localFieldId);
    assert.equal(index.parentNodeIds.get(sharedFieldId!), 'schema');
    assert.equal(index.parentNodeIds.get(localFieldId!), 'project');
    assert.equal(index.nodesById.get(sharedFieldId!)?.fieldDefinition?.type, 'plain');
    assert.equal(index.nodesById.get(localFieldId!)?.fieldDefinition?.type, 'number');
  });

  test('turns a transient Supertag child into a direct local Field Definition', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p
      },
      {
        children: [{ text: '' }],
        id: 'template-input',
        indent: 1,
        type: KEYS.p
      }
    ]);

    assert.equal(isSupertagFieldInputNode(editor.children, [1]), true);
    const fieldId = field(editor).completeTemplateInput('template-input', 'project', {
      name: 'Priority',
      type: 'create'
    });
    const index = buildTanaIndex(editor.children);
    const definition = fieldId ? index.nodesById.get(fieldId) : undefined;

    // New local Field converges to a direct Definition child; no extra
    // occurrence is created inside the template.
    assert.equal(fieldId, 'template-input');
    assert.equal(definition?.fieldDefinition?.type, 'plain');
    assert.equal(definition?.node.indent, 1);
    assert.equal(
      (editor.children.find((node) => node.id === 'template-input') as { tanaFieldDefinition?: unknown })?.tanaFieldDefinition !== undefined,
      true
    );
    assert.equal(
      (editor.children.find((node) => node.id === 'template-input') as { tanaFieldId?: unknown })?.tanaFieldId,
      undefined
    );
    assert.equal(index.fieldNodesById.has('template-input'), false);
    assert.deepEqual(
      index.childrenByParent.get('project'),
      ['template-input']
    );
    assert.equal(isSupertagFieldInputNode(editor.children, [1]), false);
  });

  test('turns a transient Supertag child into a shared occurrence when selecting an existing Field', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Schema' }],
        id: 'schema',
        tanaSystemNode: 'schema',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'template-input',
        indent: 1,
        type: KEYS.p,
      },
    ]);

    const fieldId = field(editor).completeTemplateInput('template-input', 'project', {
      fieldId: 'status',
    });
    const index = buildTanaIndex(editor.children);

    assert.equal(fieldId, 'status');
    assert.equal(
      editor.children.find((node) => node.id === 'template-input')?.tanaFieldId,
      'status'
    );
    assert.equal(index.fieldNodesById.get('template-input')?.parentNodeId, 'project');
    assert.ok(index.fieldNodesById.get('template-input')?.valueNodeId);
  });

  test('materializes every template Field when applying a Supertag and keeps Field labels dynamic', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p
      },
      {
        children: [{ text: '' }],
        id: 'template-title',
        indent: 1,
        tanaFieldId: 'title',
        type: KEYS.p
      },
      {
        children: [{ text: 'Untitled' }],
        id: 'template-title-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p
      },
      {
        children: [{ text: '' }],
        id: 'template-estimate',
        indent: 1,
        tanaFieldId: 'estimate',
        type: KEYS.p
      },
      {
        children: [{ text: '' }],
        id: 'template-estimate-value',
        indent: 2,
        tanaFieldValueType: 'number',
        type: KEYS.p
      },
      {
        children: [{ text: 'Title' }],
        id: 'title',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p
      },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p }
    ]);

    assert.equal(editor.getTransforms(TanaSupertagPlugin).supertag.apply('task', 'project'), true);

    const index = buildTanaIndex(editor.children);
    const fields = index.fieldNodesByParent.get('task') ?? [];
    const descriptors = getNodeFieldDescriptors(index, 'task');

    assert.deepEqual(
      fields.map(({ fieldId }) => fieldId),
      ['title', 'estimate']
    );
    assert.deepEqual(
      index.fieldValues.get('task'),
      new Map([['title', { type: 'plain', value: 'Untitled' }]])
    );
    assert.deepEqual(
      descriptors
        .filter((descriptor) => descriptor.source !== 'system')
        .map(({ fieldNodeId, key, label }) => ({ fieldNodeId, key, label })),
      fields.map((fieldNode) => ({
        fieldNodeId: fieldNode.id,
        key: fieldNode.id,
        label: index.nodesById.get(fieldNode.fieldId)?.text
      }))
    );
  });

  test('keeps Field and Value Nodes out of the inspector child summary', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: '' }],
        id: 'task-status',
        indent: 1,
        tanaFieldId: 'status',
        type: KEYS.p
      },
      {
        children: [{ text: '' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'options',
        type: KEYS.p
      },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'options' },
        type: KEYS.p
      }
    ]);

    const children = getNodeFieldDescriptors(buildTanaIndex(editor.children), 'task').find(
      ({ key }) => key === '$system:children'
    );

    assert.equal(children?.systemValue, 'Notes');
  });

  test('keeps compatibility a pure type check', () => {
    assert.equal(isFieldValueCompatible({ type: 'number' }, { type: 'plain', value: '1' }), false);
    assert.equal(isFieldValueCompatible({ type: 'number' }, { type: 'number', value: 1 }), true);
  });

  test('accepts only valid URL and Email FieldValue writes while preserving their Value Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Website' }], id: 'website', tanaFieldDefinition: { type: 'url' }, type: KEYS.p },
      { children: [{ text: 'Contact' }], id: 'contact', tanaFieldDefinition: { type: 'email' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'website'));
    assert.ok(transforms.materialize('task', 'contact'));
    assert.equal(
      transforms.setValue('task', 'website', { type: 'url', value: 'not-a-url' }),
      false
    );
    assert.equal(
      transforms.setValue('task', 'contact', { type: 'email', value: 'not-an-email' }),
      false
    );
    assert.equal(
      transforms.setValue('task', 'website', { type: 'url', value: 'https://localtana.app/docs' }),
      true
    );
    assert.equal(
      transforms.setValue('task', 'contact', { type: 'email', value: 'hello@localtana.app' }),
      true
    );

    const index = buildTanaIndex(editor.children);

    assert.equal(
      isFieldValueValid(index, 'website', { type: 'url', value: 'https://localtana.app/docs' }),
      true
    );
    assert.deepEqual(index.fieldValues.get('task'), new Map([
      ['website', { type: 'url', value: 'https://localtana.app/docs' }],
      ['contact', { type: 'email', value: 'hello@localtana.app' }],
    ]));
  });

  test('pins a real Field occurrence for presentation without changing document hierarchy', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'First' }], id: 'first', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Second' }], id: 'second', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);
    const first = transforms.materialize('task', 'first');
    const second = transforms.materialize('task', 'second');

    assert.ok(first);
    assert.ok(second);
    const documentOrder = editor.children.map((node) => node.id);
    assert.equal(transforms.setPinned(second, true), true);
    assert.equal(transforms.setPinned('task', true), false);
    assert.deepEqual(editor.children.map((node) => node.id), documentOrder);

    const descriptors = getNodeFieldDescriptors(buildTanaIndex(editor.children), 'task')
      .filter((descriptor) => descriptor.source !== 'system');

    assert.deepEqual(
      descriptors.map(({ fieldId, pinned }) => ({ fieldId, pinned })),
      [
        { fieldId: 'second', pinned: true },
        { fieldId: 'first', pinned: false },
      ]
    );
  });

  test('enforces Number min/max for new writes without deleting an existing Value Node', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { max: 8, min: 2, type: 'number' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'estimate'));
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 1 }), false);
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 9 }), false);
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 5 }), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldValues.get('task'), new Map([
      ['estimate', { type: 'number', value: 5 }],
    ]));
  });

  test('keeps required as a Definition-only unset hint without creating a second Field value', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Summary' }],
        id: 'summary',
        tanaFieldDefinition: { required: true, type: 'plain' },
        type: KEYS.p,
      },
    ]);

    assert.ok(field(editor).materialize('task', 'summary'));
    const index = buildTanaIndex(editor.children);

    assert.equal(index.fieldValues.get('task')?.has('summary') ?? false, false);
    assert.equal(index.nodesById.get('summary')?.fieldDefinition?.required, true);
    assert.equal(index.fieldNodesByParent.get('task')?.[0]?.valueNodeIds.length, 1);
  });

  test('edits list cardinality through real sibling Value Nodes without a parent map', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'tags'));
    const firstValueId = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]
      .valueNodeIds[0]!;
    assert.equal(
      transforms.setValueAt('task', 'tags', firstValueId, { type: 'plain', value: 'One' }),
      true
    );
    const secondValueId = transforms.addValue('task', 'tags', { type: 'plain', value: 'Two' });

    assert.ok(secondValueId);
    let index = buildTanaIndex(editor.children);
    const fieldNode = index.fieldNodesByParent.get('task')![0]!;
    assert.deepEqual(fieldNode.valueNodeIds, [firstValueId, secondValueId]);
    assert.deepEqual(fieldNode.values, [
      { type: 'plain', value: 'One' },
      { type: 'plain', value: 'Two' },
    ]);
    assert.equal(index.fieldValues.get('task')?.has('tags') ?? false, false);
    assert.equal(isFieldSet(index, 'task', 'tags'), true);

    assert.equal(transforms.removeValue('task', 'tags', firstValueId), true);
    index = buildTanaIndex(editor.children);
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.values, [
      { type: 'plain', value: 'Two' },
    ]);

    assert.equal(transforms.clearValue('task', 'tags'), true);
    index = buildTanaIndex(editor.children);
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.valueNodeIds, []);
    assert.equal(isFieldSet(index, 'task', 'tags'), false);
    assert.equal('tanaFieldValues' in editor.children[0], false);
  });

  test('keeps existing values intact when Field cardinality changes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Summary' }],
        id: 'summary',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'summary'));
    assert.equal(
      transforms.setValue('task', 'summary', { type: 'plain', value: 'Keep this' }),
      true
    );
    assert.equal(
      transforms.updateDefinition('summary', { cardinality: 'list', required: true, type: 'plain' }),
      true
    );
    const index = buildTanaIndex(editor.children);

    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.values, [
      { type: 'plain', value: 'Keep this' },
    ]);
    assert.deepEqual(index.nodesById.get('summary')?.fieldDefinition, {
      cardinality: 'list',
      required: true,
      type: 'plain',
    });
  });

  test('allows a list Field with one value to become single without changing that Value Node', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'tags'));
    assert.equal(
      transforms.setValue('task', 'tags', { type: 'plain', value: 'One' }),
      true
    );
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!
      .valueNodeIds[0];

    assert.equal(transforms.updateDefinition('tags', { type: 'plain' }), true);

    const index = buildTanaIndex(editor.children);
    assert.deepEqual(index.nodesById.get('tags')?.fieldDefinition, { type: 'plain' });
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.values, [
      { type: 'plain', value: 'One' },
    ]);
    assert.equal(index.fieldNodesByParent.get('task')![0]!.valueNodeIds[0], valueNodeId);
  });

  test('rejects list to single when one occurrence has multiple valid Value Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'tags'));
    assert.equal(
      transforms.setValue('task', 'tags', { type: 'plain', value: 'One' }),
      true
    );
    const secondValueNodeId = transforms.addValue('task', 'tags', {
      type: 'plain',
      value: 'Two',
    });
    assert.ok(secondValueNodeId);
    const before = structuredClone(editor.children);

    assert.equal(transforms.updateDefinition('tags', { type: 'plain' }), false);

    const index = buildTanaIndex(editor.children);
    assert.deepEqual(index.nodesById.get('tags')?.fieldDefinition, {
      cardinality: 'list',
      type: 'plain',
    });
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.values, [
      { type: 'plain', value: 'One' },
      { type: 'plain', value: 'Two' },
    ]);
    assert.equal(
      index.fieldNodesByParent.get('task')![0]!.valueNodeIds.includes(secondValueNodeId),
      true
    );
    assert.deepEqual(editor.children, before);
  });

  test('rejects list to single when one real Value Node is empty', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'tags'));
    const emptyValueNodeId = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!
      .valueNodeIds[0];
    const secondValueNodeId = transforms.addValue('task', 'tags', {
      type: 'plain',
      value: 'Foo',
    });
    assert.ok(secondValueNodeId);

    assert.equal(transforms.updateDefinition('tags', { type: 'plain' }), false);

    const index = buildTanaIndex(editor.children);
    assert.deepEqual(index.nodesById.get('tags')?.fieldDefinition, {
      cardinality: 'list',
      type: 'plain',
    });
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.valueNodeIds, [
      emptyValueNodeId,
      secondValueNodeId,
    ]);
    assert.deepEqual(index.fieldNodesByParent.get('task')![0]!.values, [
      { type: 'plain', value: 'Foo' },
    ]);
  });

  test('rejects list to single when any occurrence has multiple valid Value Nodes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task A' }], id: 'task-a', type: KEYS.p },
      { children: [{ text: 'Task B' }], id: 'task-b', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task-a', 'tags'));
    assert.ok(transforms.materialize('task-b', 'tags'));
    assert.equal(
      transforms.setValue('task-a', 'tags', { type: 'plain', value: 'One' }),
      true
    );
    assert.equal(
      transforms.setValue('task-b', 'tags', { type: 'plain', value: 'One' }),
      true
    );
    const secondValueNodeId = transforms.addValue('task-b', 'tags', {
      type: 'plain',
      value: 'Two',
    });
    assert.ok(secondValueNodeId);
    const before = structuredClone(editor.children);

    assert.equal(transforms.updateDefinition('tags', { type: 'plain' }), false);

    const index = buildTanaIndex(editor.children);
    assert.deepEqual(index.nodesById.get('tags')?.fieldDefinition, {
      cardinality: 'list',
      type: 'plain',
    });
    assert.deepEqual(index.fieldNodesByParent.get('task-a')![0]!.values, [
      { type: 'plain', value: 'One' },
    ]);
    assert.deepEqual(index.fieldNodesByParent.get('task-b')![0]!.values, [
      { type: 'plain', value: 'One' },
      { type: 'plain', value: 'Two' },
    ]);
    assert.equal(
      index.fieldNodesByParent.get('task-b')![0]!.valueNodeIds.includes(secondValueNodeId),
      true
    );
    assert.deepEqual(editor.children, before);
  });
});
