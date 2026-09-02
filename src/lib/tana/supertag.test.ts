import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';

import { isTanaNodeElement } from './constants';
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

function tags(node: TElement) {
  return node.children.filter(
    (child): child is TElement =>
      'type' in child && child.type === 'tana_supertag'
  );
}

describe('Tana Supertag operations', () => {
  test('creates a definition Node and applies its inline relation without copied text', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;
    const supertagId = supertag.create(' project ');

    assert.equal(supertagId, 'node-1');
    assert.equal(supertag.apply('task', supertagId!), true);
    assert.equal(tags(editor.children[0] as TElement)[0]?.key, supertagId);
    assert.equal('value' in (tags(editor.children[0] as TElement)[0] ?? {}), false);
    assert.deepEqual(buildTanaIndex(editor.children).nodesBySupertag.get(supertagId!), [
      'task',
    ]);
    assert.equal(supertag.apply('task', supertagId!), false);
  });

  test('materializes template Field Nodes and applies template values only to unset occurrences', () => {
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
      { children: [{ text: 'New task' }], id: 'new-task', type: KEYS.p },
      { children: [{ text: 'Existing task' }], id: 'existing-task', type: KEYS.p },
    ]);
    const fields = editor.getTransforms(TanaFieldPlugin).field;

    fields.materialize('existing-task', 'title');
    fields.setValue('existing-task', 'title', { type: 'plain', value: 'Keep me' });

    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    assert.equal(supertag.apply('new-task', 'project'), true);
    assert.equal(supertag.apply('existing-task', 'project'), true);

    const index = buildTanaIndex(editor.children);

    assert.deepEqual(
      index.fieldNodesByParent.get('new-task')?.map(({ fieldId }) => fieldId),
      ['title', 'estimate']
    );
    assert.deepEqual(index.fieldValues.get('new-task'), new Map([
      ['title', { type: 'plain', value: 'Untitled' }],
    ]));
    assert.deepEqual(index.fieldValues.get('existing-task'), new Map([
      ['title', { type: 'plain', value: 'Keep me' }],
    ]));
  });

  test('does not move another Node selection while materializing Fields', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-title', indent: 1, tanaFieldId: 'title', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-title-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Title' }], id: 'title', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', type: KEYS.p },
    ]);
    editor.tf.select([5, 0], { edge: 'end' });
    const selection = structuredClone(editor.selection);

    assert.equal(
      editor.getTransforms(TanaSupertagPlugin).supertag.apply('a', 'project'),
      true
    );
    assert.equal(editor.selection?.anchor.offset, selection?.anchor.offset);
    assert.equal(editor.children[editor.selection!.anchor.path[0]].id, 'b');
    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.get('a')?.length, 1);
  });

  test('removes only the inline relation while preserving real Field Nodes', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    supertag.apply('task', 'project');
    const occurrenceId = buildTanaIndex(editor.children).fieldNodesByParent.get('task')![0]
      .id;

    assert.equal(supertag.remove('task', 'project'), true);
    assert.equal(buildTanaIndex(editor.children).nodesBySupertag.has('project'), false);
    assert.ok(buildTanaIndex(editor.children).fieldNodesById.get(occurrenceId));
  });

  test('keeps definition navigation on the Plate zoom plugin', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
    ]);

    assert.equal(editor.getTransforms(TanaZoomPlugin).zoom.to('project'), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'project');
  });
});
