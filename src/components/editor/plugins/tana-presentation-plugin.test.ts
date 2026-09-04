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
});
