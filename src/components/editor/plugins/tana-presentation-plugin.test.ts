import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type NodeEntry, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { canDropOnInteractableTanaNode } from '@/components/ui/block-draggable';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { getNodeFieldDescriptors } from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import {
  isTanaFieldNodePresentationHidden,
  isTanaNodeInteractable,
} from '@/lib/tana/outliner';

import { TanaPresentationPlugin } from './tana-presentation-plugin';

globalThis.requestAnimationFrame ??= () => 0;

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

  test('moves selection and Zoom to the owner and prunes block selection when hiding', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const fieldNodeId = editor
      .getTransforms(TanaFieldPlugin)
      .field.materialize('task', 'status');
    assert.ok(fieldNodeId);
    const valueNodeId = buildTanaIndex(editor.children).fieldNodesById.get(fieldNodeId)
      ?.valueNodeId;
    assert.ok(valueNodeId);
    const valueEntry = editor.api.node({ at: [], id: valueNodeId });
    assert.ok(valueEntry);
    const valuePath = valueEntry[1];
    const selection = editor.getApi(BlockSelectionPlugin).blockSelection;

    selection.set([fieldNodeId, valueNodeId]);
    editor.tf.select(valuePath, { edge: 'start' });
    assert.equal(editor.getTransforms(TanaZoomPlugin).zoom.to(valueNodeId), true);

    assert.equal(
      editor
        .getTransforms(TanaPresentationPlugin)
        .presentation.setFieldVisible('task', fieldNodeId, false),
      true
    );
    assert.deepEqual(
      selection.getNodes({ sort: true }).map(([node]) => node.id),
      []
    );
    assert.deepEqual(editor.selection?.anchor.path, [0, 0]);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'task');
  });

  test('excludes a hidden Field subtree from selection, DnD eligibility, and navigation', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    ]);
    const fields = editor.getTransforms(TanaFieldPlugin).field;
    const fieldNodeId = fields.materialize('task', 'status')!;
    const index = buildTanaIndex(editor.children);
    const fieldPath = index.nodesById.get(fieldNodeId)!.path;
    const valuePath = index.nodesById.get(
      index.fieldNodesById.get(fieldNodeId)!.valueNodeId!
    )!.path;

    editor
      .getTransforms(TanaPresentationPlugin)
      .presentation.setFieldVisible('task', fieldNodeId, false);

    const openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(isTanaFieldNodePresentationHidden(editor.children, fieldPath), true);
    assert.equal(isTanaFieldNodePresentationHidden(editor.children, valuePath), true);
    assert.equal(
      isTanaNodeInteractable(editor.children, fieldPath, openIds, null),
      false
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, valuePath, openIds, null),
      false
    );
    assert.equal(editor.getTransforms(TanaZoomPlugin).zoom.to(fieldNodeId), false);

    const taskEntry = editor.api.node({ at: [], id: 'task' }) as NodeEntry<TElement>;
    const fieldEntry = editor.api.node({ at: [], id: fieldNodeId }) as NodeEntry<TElement>;
    assert.equal(
      canDropOnInteractableTanaNode({
        dragEntry: taskEntry,
        dragItem: { editorId: editor.id, element: taskEntry[0], id: 'task' },
        dropEntry: fieldEntry,
        editor,
      }),
      false
    );

    const selection = editor.getApi(BlockSelectionPlugin).blockSelection;
    selection.selectAll();
    assert.deepEqual(
      selection.getNodes({ sort: true }).map(([node]) => node.id),
      ['task']
    );
  });

  test('derives every Field visibility policy from Definition data and stored Value presence', () => {
    const cases: Array<{
      hidden: boolean;
      policy: 'always' | 'never' | 'when-empty' | 'when-non-empty';
      value?: string;
    }> = [
      { hidden: false, policy: 'never' },
      { hidden: true, policy: 'always', value: 'set' },
      { hidden: true, policy: 'when-empty' },
      { hidden: false, policy: 'when-empty', value: 'set' },
      { hidden: false, policy: 'when-non-empty' },
      { hidden: true, policy: 'when-non-empty', value: 'set' },
    ];

    for (const { hidden, policy, value } of cases) {
      const editor = createEditor([
        { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
        {
          children: [{ text: 'Status' }],
          id: 'status',
          tanaFieldDefinition: { type: 'plain', visibility: policy },
          type: KEYS.p,
        },
      ]);
      const fieldNodeId = editor.getTransforms(TanaFieldPlugin).field.materialize('task', 'status')!;

      if (value) {
        editor.getTransforms(TanaFieldPlugin).field.setValue('task', 'status', {
          type: 'plain',
          value,
        });
      }

      const index = buildTanaIndex(editor.children);
      const fieldPath = index.nodesById.get(fieldNodeId)!.path;

      assert.equal(isTanaFieldNodePresentationHidden(editor.children, fieldPath), hidden);
      assert.equal(
        editor.children[0].tanaPresentation,
        undefined,
        `${policy} remains derived rather than an instance visibility write`
      );
    }
  });

  test('derives when-default from current Values and real Supertag template Values', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'template-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Draft' }], id: 'template-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain', visibility: 'when-default' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', tanaSupertagIds: ['project'], type: KEYS.p },
    ]);
    const fields = editor.getTransforms(TanaFieldPlugin).field;
    const fieldNodeId = fields.materialize('task', 'status')!;

    fields.setValue('task', 'status', { type: 'plain', value: 'Draft' });
    let index = buildTanaIndex(editor.children);
    let fieldPath = index.nodesById.get(fieldNodeId)!.path;

    assert.equal(isTanaFieldNodePresentationHidden(editor.children, fieldPath), true);
    assert.equal(
      getNodeFieldDescriptors(index, 'task').find(({ fieldNodeId: id }) => id === fieldNodeId)?.visible,
      false
    );

    fields.setValue('task', 'status', { type: 'plain', value: 'Published' });
    index = buildTanaIndex(editor.children);
    fieldPath = index.nodesById.get(fieldNodeId)!.path;

    assert.equal(isTanaFieldNodePresentationHidden(editor.children, fieldPath), false);
    assert.equal(
      getNodeFieldDescriptors(index, 'task').find(({ fieldNodeId: id }) => id === fieldNodeId)?.visible,
      true
    );
    assert.equal(editor.children.find((node) => node.id === 'task')?.tanaPresentation, undefined);
  });

  test('lets a direct template binding replace an inherited when-default value', () => {
    const editor = createEditor([
      { children: [{ text: 'Base' }], id: 'base', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'base-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Inherited' }], id: 'base-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: { extends: ['base'] }, type: KEYS.p },
      { children: [{ text: '' }], id: 'project-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: '' }], id: 'project-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain', visibility: 'when-default' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', tanaSupertagIds: ['project'], type: KEYS.p },
    ]);
    const fieldNodeId = editor.getTransforms(TanaFieldPlugin).field.materialize('task', 'status')!;

    editor.getTransforms(TanaFieldPlugin).field.setValue('task', 'status', {
      type: 'plain',
      value: 'Inherited',
    });
    const fieldPath = buildTanaIndex(editor.children).nodesById.get(fieldNodeId)!.path;

    assert.equal(isTanaFieldNodePresentationHidden(editor.children, fieldPath), false);
  });
});
