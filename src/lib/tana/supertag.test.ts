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
import { resolveTanaNodeTitle } from './title';

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
  test('creates a definition under Schema and applies Node-level membership', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Schema' }],
        id: 'schema',
        tanaSystemNode: 'schema',
        type: KEYS.p,
      },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;
    const supertagId = supertag.create(' project ');

    assert.equal(supertagId, 'node-1');
    assert.equal(supertag.apply('task', supertagId!), true);
    assert.deepEqual((editor.children[0] as TElement).tanaSupertagIds, [supertagId]);
    assert.equal(tags(editor.children[0] as TElement)[0]?.key, supertagId);
    assert.equal('value' in (tags(editor.children[0] as TElement)[0] ?? {}), false);
    assert.deepEqual(buildTanaIndex(editor.children).nodesBySupertag.get(supertagId!), [
      'task',
    ]);
    assert.equal(
      buildTanaIndex(editor.children).parentNodeIds.get(supertagId!),
      'schema'
    );
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
    assert.deepEqual(index.nodesById.get('new-task')?.supertagIds, ['project']);
  });

  test('materializes a local Field Definition template without copying the definition', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    assert.equal(supertag.apply('task', 'project'), true);

    const index = buildTanaIndex(editor.children);
    const occurrence = index.fieldNodesByParent.get('task')?.[0];

    assert.equal(occurrence?.fieldId, 'priority');
    assert.equal(index.nodesById.get('priority')?.fieldDefinition?.type, 'plain');
    assert.equal(index.parentNodeIds.get('priority'), 'project');
  });

  test('materializes a plain template subtree as fresh ordinary Nodes after Field templates', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-title', indent: 1, tanaFieldId: 'title', type: KEYS.p },
      { children: [{ text: '' }], id: 'template-title-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'First note' }], id: 'template-note', indent: 1, type: KEYS.p },
      { children: [{ text: 'Nested note' }], id: 'template-nested', indent: 2, type: KEYS.p },
      { children: [{ text: 'Title' }], id: 'title', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(editor.getTransforms(TanaSupertagPlugin).supertag.apply('task', 'project'), true);

    const index = buildTanaIndex(editor.children);
    const clonedRoot = Array.from(index.nodesById.values()).find(
      (node) => node.text === 'First note' && node.id !== 'template-note'
    );
    const clonedChild = Array.from(index.nodesById.values()).find(
      (node) => node.text === 'Nested note' && node.id !== 'template-nested'
    );

    assert.ok(clonedRoot);
    assert.ok(clonedChild);
    assert.notEqual(clonedRoot.id, 'template-note');
    assert.notEqual(clonedChild.id, 'template-nested');
    assert.equal(index.parentNodeIds.get(clonedRoot.id), 'task');
    assert.equal(index.parentNodeIds.get(clonedChild.id), clonedRoot.id);
    assert.equal(clonedRoot.node.tanaFieldId, undefined);
    assert.deepEqual(index.fieldNodesByParent.get('task')?.map(({ fieldId }) => fieldId), ['title']);
  });

  test('keeps an optional template Field unmaterialized until the user adds its real Field Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'template-owner',
        indent: 1,
        tanaFieldId: 'owner',
        tanaFieldOptional: true,
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template-owner-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Owner' }], id: 'owner', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;
    const fields = editor.getTransforms(TanaFieldPlugin).field;

    assert.equal(supertag.apply('task', 'project'), true);
    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.length ?? 0, 0);
    assert.equal(fields.materialize('task', 'owner') !== undefined, true);
    assert.deepEqual(buildTanaIndex(editor.children).fieldNodesByParent.get('task')?.map(({ fieldId }) => fieldId), ['owner']);
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

  test('removes only Node-level membership while preserving real Field Nodes', () => {
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
    assert.equal('tanaSupertagIds' in editor.children.find((node) => node.id === 'task')!, false);
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

  test('inherits parent templates and derived membership without copying a second schema', () => {
    const editor = createEditor([
      { children: [{ text: 'Base' }], id: 'base', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'base-title', indent: 1, tanaFieldId: 'title', type: KEYS.p },
      { children: [{ text: '' }], id: 'base-title-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task-tag', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'task-effort', indent: 1, tanaFieldId: 'effort', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-effort-value', indent: 2, tanaFieldValueType: 'number', type: KEYS.p },
      { children: [{ text: 'Title' }], id: 'title', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Effort' }], id: 'effort', tanaFieldDefinition: { type: 'number' }, type: KEYS.p },
      { children: [{ text: 'Ship it' }], id: 'ship-it', type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    assert.equal(supertag.setExtends('task-tag', ['base']), true);
    assert.equal(supertag.apply('ship-it', 'task-tag'), true);

    const index = buildTanaIndex(editor.children);

    assert.deepEqual(
      index.fieldNodesByParent.get('ship-it')?.map(({ fieldId }) => fieldId),
      ['title', 'effort']
    );
    assert.deepEqual(index.nodesBySupertag.get('task-tag'), ['ship-it']);
    assert.deepEqual(index.nodesBySupertag.get('base'), ['ship-it']);
    assert.equal(index.nodesById.get('title')?.fieldDefinition?.type, 'plain');
  });

  test('rejects self and cyclic SuperTag inheritance writes', () => {
    const editor = createEditor([
      { children: [{ text: 'A' }], id: 'a', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', tanaSupertagDefinition: {}, type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    assert.equal(supertag.setExtends('a', ['a']), false);
    assert.equal(supertag.setExtends('a', ['b']), true);
    assert.equal(supertag.setExtends('b', ['a']), false);
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, { extends: ['b'] });
    assert.deepEqual(editor.children[1].tanaSupertagDefinition, {});
  });

  test('applies a configured default child SuperTag without a second child-state store', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { defaultChildSupertagId: 'task' },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: 'Parent' }], id: 'parent', tanaSupertagIds: ['project'], type: KEYS.p },
      { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
    ]);
    const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

    assert.equal(supertag.applyDefaultChild('child'), true);
    assert.deepEqual(buildTanaIndex(editor.children).nodesById.get('child')?.supertagIds, ['task']);
    assert.equal(supertag.setDefaultChildSupertag('project', 'missing'), false);
  });

  test('derives a title expression from canonical Field Nodes without rewriting title text', () => {
    const index = buildTanaIndex([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { titleExpression: '${Status} · ${name|4…}' },
        type: KEYS.p,
      },
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Ship today' }], id: 'task', tanaSupertagIds: ['project'], type: KEYS.p },
      { children: [{ text: '' }], id: 'task-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Doing' }], id: 'task-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
    ]);

    assert.equal(index.nodesById.get('task')?.rawText, 'Ship today');
    assert.equal(index.nodesById.get('task')?.text, 'Ship today');
    assert.equal(resolveTanaNodeTitle(index, 'task'), 'Doing · Ship…');
  });
});
