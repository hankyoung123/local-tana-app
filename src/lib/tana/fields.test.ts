import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';
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
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'First' }], id: 'first', indent: 1, type: KEYS.p },
      { children: [{ text: 'Second' }], id: 'second', indent: 1, type: KEYS.p }
    ]);
    normalTabEditor.getApi(TogglePlugin).toggle.toggleIds(['workspace'], true);
    normalTabEditor.tf.select({
      anchor: { offset: 0, path: [2, 0] },
      focus: { offset: 0, path: [2, 0] }
    });
    assert.equal(normalTabEditor.tf.tab({ reverse: false }), true);
    assert.equal(normalTabEditor.children[2].indent, 2);
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

  test('stores raw scalar edits through the Field writer, including invalid text and undo/redo', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { max: 8, type: 'number' },
        type: KEYS.p,
      },
    ]);

    field(editor).materialize('task', 'estimate');
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!.valueNodeId!;

    assert.equal(field(editor).setRawScalarValue('task', 'estimate', 'draft', valueNodeId), true);
    let index = buildTanaIndex(editor.children);
    let occurrence = index.fieldNodesByParent.get('task')![0]!;
    assert.equal(index.nodesById.get(valueNodeId)?.text, 'draft');
    assert.equal(occurrence.hasStoredValue, true);
    assert.deepEqual(occurrence.values, []);
    assert.deepEqual(occurrence.validationIssuesByValueNodeId.get(valueNodeId), ['invalid-number']);

    editor.tf.undo();
    assert.equal(buildTanaIndex(editor.children).nodesById.get(valueNodeId)?.text, '');
    editor.tf.redo();
    index = buildTanaIndex(editor.children);
    occurrence = index.fieldNodesByParent.get('task')![0]!;
    assert.equal(index.nodesById.get(valueNodeId)?.text, 'draft');
    assert.deepEqual(occurrence.validationIssuesByValueNodeId.get(valueNodeId), ['invalid-number']);
  });

  test('materializes a configured list Field and adds its first editable Value in one action', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Tags' }],
        id: 'tags',
        tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
        type: KEYS.p,
      },
    ]);

    const valueNodeId = field(editor).addValue('task', 'tags');
    const occurrence = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;

    assert.ok(valueNodeId);
    assert.deepEqual(occurrence.valueNodeIds, [valueNodeId]);
    assert.equal(field(editor).setRawScalarValue('task', 'tags', 'first', valueNodeId), true);
    assert.ok(field(editor).addValue('task', 'tags', { type: 'plain', value: 'second' }));
    assert.deepEqual(
      buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!.values,
      [
        { type: 'plain', value: 'first' },
        { type: 'plain', value: 'second' },
      ]
    );
  });

  test('stores invalid Options writes and derives a warning without treating the Field as unset', () => {
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

    assert.equal(
      field(editor).setValue('task', 'status', {
        type: 'options',
        value: 'other'
      }),
      true
    );
    const occurrence = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;

    assert.deepEqual(occurrence.values, [{ type: 'options', value: 'other' }]);
    assert.deepEqual(
      occurrence.validationIssuesByValueNodeId.get(occurrence.valueNodeId!),
      ['invalid-option']
    );
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

  test('derives Options candidates from static, one-hop Reference, and Search sources', () => {
    const index = buildTanaIndex([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Static' }], id: 'static', indent: 1, type: KEYS.p },
      { children: [{ text: 'Source reference' }], id: 'source-reference', indent: 1, tanaReferenceTargetId: 'source', type: KEYS.p },
      {
        children: [{ text: 'Search source' }],
        id: 'search-source',
        indent: 1,
        tanaSearchDefinition: {
          query: {
            children: [{ predicate: { kind: 'text-contains', text: 'Search candidate' }, type: 'predicate' }],
            type: 'and',
          },
        },
        type: KEYS.p,
      },
      { children: [{ text: 'Broken source' }], id: 'broken-source', indent: 1, tanaReferenceTargetId: 'missing', type: KEYS.p },
      { children: [{ text: 'Source' }], id: 'source', type: KEYS.p },
      { children: [{ text: 'Source child' }], id: 'source-child', indent: 1, type: KEYS.p },
      { children: [{ text: 'Alias child' }], id: 'source-child-reference', indent: 1, tanaReferenceTargetId: 'canonical-child', type: KEYS.p },
      { children: [{ text: 'Trashed alias child' }], id: 'source-trashed-reference', indent: 1, tanaReferenceTargetId: 'trashed-candidate', type: KEYS.p },
      { children: [{ text: 'Canonical child' }], id: 'canonical-child', type: KEYS.p },
      { children: [{ text: 'Search candidate' }], id: 'search-candidate', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', tanaSystemNode: 'trash', type: KEYS.p },
      { children: [{ text: 'Trashed candidate' }], id: 'trashed-candidate', indent: 1, type: KEYS.p },
    ]);

    assert.deepEqual(
      getFieldValueCandidates(index, 'status').map(({ id }) => id),
      ['static', 'source-child', 'canonical-child', 'search-candidate']
    );
  });

  test('creates an Options candidate Node and assigns it in one undoable batch', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const transforms = field(editor);
    const before = structuredClone(editor.children);

    assert.equal(transforms.createOptionAndAssign('task', 'status', 'Collected'), true);
    const after = structuredClone(editor.children);
    const optionId = getFieldValueCandidates(buildTanaIndex(editor.children), 'status')[0]?.id;
    const occurrence = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;

    assert.ok(optionId);
    assert.deepEqual(occurrence.values, [{ type: 'options', value: optionId }]);
    editor.tf.undo();
    assert.deepEqual(editor.children, before);
    editor.tf.redo();
    assert.deepEqual(editor.children, after);
  });

  test('creates a From-Supertag instance and assigns its canonical NodeId in one undoable batch', () => {
    const editor = createEditor([
      { children: [{ text: 'Home' }], id: 'home', tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { sourceSupertagId: 'person', type: 'from-supertag' },
        type: KEYS.p,
      },
      { children: [{ text: 'Person' }], id: 'person', tanaSupertagDefinition: {}, type: KEYS.p },
    ]);
    const before = structuredClone(editor.children);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    const instanceId = supertag.createSourceInstanceAndAssign(
      'task',
      'owner',
      'person',
      'Ada'
    );
    const after = structuredClone(editor.children);

    assert.ok(instanceId);
    assert.equal(buildTanaIndex(editor.children).nodesById.get(instanceId)?.text, 'Ada');
    assert.deepEqual(buildTanaIndex(editor.children).nodesById.get(instanceId)?.supertagIds, ['person']);
    assert.deepEqual(
      buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values,
      [{ type: 'from-supertag', value: instanceId }]
    );
    editor.tf.undo();
    assert.deepEqual(editor.children, before);
    editor.tf.redo();
    assert.deepEqual(editor.children, after);
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

  test('preserves typed Value identity and text when a Definition type changes', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'When' }], id: 'when', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'when'));
    assert.equal(
      transforms.setValue('task', 'when', { type: 'plain', value: 'not a date' }),
      true
    );
    const before = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;
    const valueNodeId = before.valueNodeId!;

    assert.equal(transforms.updateDefinition('when', { type: 'date' }), true);
    let changed = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;
    assert.equal(changed.valueNodeId, valueNodeId);
    assert.deepEqual(changed.values, [{ type: 'plain', value: 'not a date' }]);
    assert.deepEqual(
      changed.validationIssuesByValueNodeId.get(valueNodeId),
      ['incompatible-type']
    );
    const valuePath = getTanaNodePath(editor.children, valueNodeId)!;
    assert.equal(editor.children[valuePath[0]]?.tanaFieldValueType, 'plain');
    assert.deepEqual(editor.children[valuePath[0]]?.children, [{ text: 'not a date' }]);

    editor.tf.undo();
    assert.deepEqual(editor.children.find((node) => node.id === 'when')?.tanaFieldDefinition, {
      type: 'plain',
    });
    editor.tf.redo();
    changed = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;
    assert.equal(changed.valueNodeId, valueNodeId);
    assert.deepEqual(
      changed.validationIssuesByValueNodeId.get(valueNodeId), ['incompatible-type']);
  });

  test('stores invalid URL and Email writes while preserving Value Nodes and warnings', () => {
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
      true
    );
    assert.equal(
      transforms.setValue('task', 'contact', { type: 'email', value: 'not-an-email' }),
      true
    );
    const invalidIndex = buildTanaIndex(editor.children);
    const invalidWebsite = invalidIndex.fieldNodesByParent.get('task')?.find(
      ({ fieldId }) => fieldId === 'website'
    );
    const invalidContact = invalidIndex.fieldNodesByParent.get('task')?.find(
      ({ fieldId }) => fieldId === 'contact'
    );
    assert.deepEqual(invalidWebsite?.values, [{ type: 'url', value: 'not-a-url' }]);
    assert.deepEqual(
      invalidWebsite?.validationIssuesByValueNodeId.get(invalidWebsite.valueNodeId!),
      ['invalid-url']
    );
    assert.deepEqual(invalidContact?.values, [{ type: 'email', value: 'not-an-email' }]);
    assert.deepEqual(
      invalidContact?.validationIssuesByValueNodeId.get(invalidContact.valueNodeId!),
      ['invalid-email']
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

  test('derives pinned instance presentation from its Supertag template without copying it', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaSupertagIds: ['tag'],
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'tag',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-first', indent: 1, tanaFieldId: 'first', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-first-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'First' }], id: 'first', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Second' }], id: 'second', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);
    const first = transforms.materialize('task', 'first');
    const second = transforms.materialize('task', 'second');

    assert.ok(first);
    assert.ok(second);
    const documentOrder = editor.children.map((node) => node.id);
    assert.equal(transforms.setPinned('template-first', true), true);
    assert.equal(transforms.setPinned(first, true), false);
    assert.equal(transforms.setPinned('task', true), false);
    assert.deepEqual(editor.children.map((node) => node.id), documentOrder);

    const descriptors = getNodeFieldDescriptors(buildTanaIndex(editor.children), 'task')
      .filter((descriptor) => descriptor.source !== 'system');

    assert.deepEqual(
      descriptors.map(({ fieldId, pinned }) => ({ fieldId, pinned })),
      [
        { fieldId: 'first', pinned: true },
        { fieldId: 'second', pinned: false },
      ]
    );
  });

  test('stores Number min/max failures and derives a warning without deleting the Value Node', () => {
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
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 1 }), true);
    const occurrence = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;
    assert.deepEqual(occurrence.values, [{ type: 'number', value: 1 }]);
    assert.deepEqual(
      occurrence.validationIssuesByValueNodeId.get(occurrence.valueNodeId!),
      ['invalid-number']
    );
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 9 }), true);
    assert.equal(transforms.setValue('task', 'estimate', { type: 'number', value: 5 }), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldValues.get('task'), new Map([
      ['estimate', { type: 'number', value: 5 }],
    ]));
  });

  test('stores Checkbox false and true distinctly, then clears back to unset', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Done' }], id: 'done', tanaFieldDefinition: { type: 'checkbox' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'done'));
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values, []);
    assert.equal(transforms.setValue('task', 'done', { type: 'checkbox', value: false }), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values, [
      { type: 'checkbox', value: false },
    ]);
    assert.equal(transforms.setValue('task', 'done', { type: 'checkbox', value: true }), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values, [
      { type: 'checkbox', value: true },
    ]);
    assert.equal(transforms.clearValue('task', 'done'), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values, []);
  });

  test('stores Date text in its canonical Value Node and warns without creating a second date store', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task', 'due'));
    assert.equal(transforms.setValue('task', 'due', { type: 'date', value: '2026-02-29' }), true);
    const occurrence = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]!;
    assert.deepEqual(occurrence.values, [{ type: 'date', value: '2026-02-29' }]);
    assert.deepEqual(
      occurrence.validationIssuesByValueNodeId.get(occurrence.valueNodeId!),
      ['invalid-date']
    );
    assert.equal(transforms.clearValue('task', 'due'), true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.[0]?.values, []);
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
    assert.deepEqual(index.fieldNodesByParent.get('task')?.[0]?.validationIssues, [
      'missing-required',
    ]);
  });

  test('writes every Host-level Field operation through one live Reference target', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Task reference' }], id: 'task-reference', tanaReferenceTargetId: 'task', type: KEYS.p },
      { children: [{ text: 'Summary' }], id: 'summary', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Labels' }], id: 'labels', tanaFieldDefinition: { cardinality: 'list', type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.ok(transforms.materialize('task-reference', 'summary'));
    assert.equal(
      transforms.setValue('task-reference', 'summary', { type: 'plain', value: 'canonical' }),
      true
    );
    const summary = buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.find(
      ({ fieldId }) => fieldId === 'summary'
    );
    assert.deepEqual(summary?.values, [{ type: 'plain', value: 'canonical' }]);
    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.has('task-reference'), false);
    assert.equal(transforms.clearValue('task-reference', 'summary'), true);

    assert.ok(transforms.materialize('task-reference', 'labels'));
    const firstValueId = buildTanaIndex(editor.children)
      .fieldNodesByParent.get('task')!
      .find(({ fieldId }) => fieldId === 'labels')!
      .valueNodeIds[0]!;
    assert.equal(
      transforms.setValueAt('task-reference', 'labels', firstValueId, {
        type: 'plain',
        value: 'first',
      }),
      true
    );
    const secondValueId = transforms.addValue('task-reference', 'labels', {
      type: 'plain',
      value: 'second',
    });
    assert.ok(secondValueId);
    assert.equal(transforms.removeValue('task-reference', 'labels', secondValueId), true);
    assert.equal(transforms.deleteAdHoc('task-reference', 'summary'), true);
    assert.equal(
      buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.some(
        ({ fieldId }) => fieldId === 'summary'
      ) ?? false,
      false
    );
  });

  test('fails Field writes closed for broken and chained References', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'task', type: KEYS.p },
      { children: [{ text: 'Chained' }], id: 'chained', tanaReferenceTargetId: 'reference', type: KEYS.p },
      { children: [{ text: 'Broken' }], id: 'broken', tanaReferenceTargetId: 'missing', type: KEYS.p },
      { children: [{ text: 'Summary' }], id: 'summary', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);

    assert.equal(transforms.materialize('chained', 'summary'), undefined);
    assert.equal(transforms.materialize('broken', 'summary'), undefined);
    assert.equal(transforms.setValue('chained', 'summary', { type: 'plain', value: 'nope' }), false);
    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.has('task'), false);
  });

  test('records Field mutations as individual undoable history batches', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Task reference' }], id: 'task-reference', tanaReferenceTargetId: 'task', type: KEYS.p },
      { children: [{ text: 'Summary' }], id: 'summary', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Tags' }], id: 'tags', tanaFieldDefinition: { cardinality: 'list', type: 'plain' }, type: KEYS.p },
    ]);
    const transforms = field(editor);
    const assertOneUndo = (action: () => unknown) => {
      const before = structuredClone(editor.children);

      action();
      const after = structuredClone(editor.children);
      assert.notDeepEqual(after, before);
      editor.tf.undo();
      assert.deepEqual(editor.children, before);
      editor.tf.redo();
      assert.deepEqual(editor.children, after);
    };

    assertOneUndo(() => transforms.materialize('task', 'summary'));
    assertOneUndo(() =>
      transforms.setValue('task-reference', 'summary', { type: 'plain', value: 'canonical' })
    );
    assertOneUndo(() => transforms.clearValue('task-reference', 'summary'));
    assertOneUndo(() => transforms.materialize('task', 'tags'));
    assertOneUndo(() => transforms.addValue('task-reference', 'tags', { type: 'plain', value: 'second' }));
    const removableValueId = buildTanaIndex(editor.children)
      .fieldNodesByParent.get('task')!
      .find(({ fieldId }) => fieldId === 'tags')!
      .valueNodeIds.at(-1)!;
    assertOneUndo(() => transforms.removeValue('task-reference', 'tags', removableValueId));
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
    const secondValueId = transforms.addValue('task', 'tags');

    assert.ok(secondValueId);
    const secondValuePath = getTanaNodePath(editor.children, secondValueId);
    assert.ok(secondValuePath);
    assert.deepEqual(editor.selection, {
      anchor: { offset: 0, path: [...secondValuePath, 0] },
      focus: { offset: 0, path: [...secondValuePath, 0] },
    });
    assert.equal(
      transforms.setValueAt('task', 'tags', secondValueId, {
        type: 'plain',
        value: 'Two',
      }),
      true
    );
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
