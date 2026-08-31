import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { isTanaNodeElement } from './constants';
import { buildTanaIndex } from './index';

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

function tagElements(node: TElement) {
  return node.children.filter(
    (child): child is TElement =>
      'type' in child && child.type === 'tana_supertag'
  );
}

function supertag(editor: ReturnType<typeof createEditor>) {
  return editor.getTransforms(TanaSupertagPlugin).supertag;
}

function createSupertag(editor: ReturnType<typeof createEditor>, name: string) {
  return supertag(editor).create(name);
}

function applySupertag(
  editor: ReturnType<typeof createEditor>,
  nodeId: string,
  supertagId: string
) {
  return supertag(editor).apply(nodeId, supertagId);
}

function removeSupertag(
  editor: ReturnType<typeof createEditor>,
  nodeId: string,
  supertagId: string
) {
  return supertag(editor).remove(nodeId, supertagId);
}

function navigateToNode(editor: ReturnType<typeof createEditor>, nodeId: string) {
  return editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
}

describe('Tana supertag operations', () => {
  test('creates a definition Node and applies it without a copied name', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);
    const supertagId = createSupertag(editor, ' project ');

    assert.equal(supertagId, 'node-1');
    assert.equal(editor.children[1].id, supertagId);
    assert.deepEqual(editor.children[1].tanaSupertagDefinition, { fields: [] });
    assert.equal(applySupertag(editor, 'task', supertagId), true);

    const tag = tagElements(editor.children[0] as TElement)[0];

    assert.equal(tag?.key, supertagId);
    assert.equal('value' in (tag ?? {}), false);
    assert.deepEqual(buildTanaIndex(editor.children).nodesBySupertag.get(supertagId), [
      'task',
    ]);

    const abbreviatedId = createSupertag(editor, 'proj');

    assert.equal(abbreviatedId, 'node-2');
    assert.equal(editor.children[2].children[0].text, 'proj');
  });

  test('does not duplicate an applied supertag relation', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(applySupertag(editor, 'task', 'project-tag'), true);
    assert.equal(applySupertag(editor, 'task', 'project-tag'), false);
    assert.equal(tagElements(editor.children[1] as TElement).length, 1);
  });

  test('instantiates explicit defaults only and never overwrites field values', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: {
          fields: [
            {
              defaultValue: { type: 'plain', value: 'Untitled' },
              fieldId: 'title',
            },
            { fieldId: 'estimate' },
          ],
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Title' }],
        id: 'title',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
      { children: [{ text: 'Empty task' }], id: 'empty-task', type: KEYS.p },
      {
        children: [{ text: 'Existing task' }],
        id: 'existing-task',
        tanaFieldValues: { title: { type: 'plain', value: 'Keep me' } },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Direct empty task' }],
        id: 'direct-empty-task',
        tanaFieldValues: { title: null },
        type: KEYS.p,
      },
    ]);

    assert.equal(applySupertag(editor, 'empty-task', 'project-tag'), true);
    assert.equal(applySupertag(editor, 'existing-task', 'project-tag'), true);
    assert.equal(applySupertag(editor, 'direct-empty-task', 'project-tag'), true);
    assert.deepEqual(editor.children[3].tanaFieldValues, {
      title: { type: 'plain', value: 'Untitled' },
    });
    assert.deepEqual(editor.children[4].tanaFieldValues, {
      title: { type: 'plain', value: 'Keep me' },
    });
    assert.deepEqual(editor.children[5].tanaFieldValues, { title: null });
  });

  test('does not move another Node selection while applying a relation', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: {
          fields: [
            {
              defaultValue: { type: 'plain', value: 'Untitled' },
              fieldId: 'title',
            },
          ],
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Title' }],
        id: 'title',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', type: KEYS.p },
    ]);
    editor.tf.select([3, 0], { edge: 'end' });
    const selectionBeforeApply = structuredClone(editor.selection);
    const nodeBBeforeApply = structuredClone(editor.children[3]);

    assert.equal(applySupertag(editor, 'a', 'project-tag'), true);
    assert.deepEqual(editor.selection, selectionBeforeApply);
    assert.deepEqual(editor.children[3], nodeBBeforeApply);
    assert.deepEqual(editor.children[2].tanaFieldValues, {
      title: { type: 'plain', value: 'Untitled' },
    });
  });

  test('removes only the relation while preserving field values and definition', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
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

    assert.equal(applySupertag(editor, 'task', 'project-tag'), true);
    assert.equal(removeSupertag(editor, 'task', 'project-tag'), true);

    const index = buildTanaIndex(editor.children);

    assert.equal(index.nodesBySupertag.has('project-tag'), false);
    assert.deepEqual(editor.children[2].tanaFieldValues, {
      status: { type: 'plain', value: 'Active' },
    });
    assert.ok(index.nodesById.get('project-tag'));
  });

  test('derives instances and navigates inline tags to the definition Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: 'Project A' }], id: 'project-a', type: KEYS.p },
      { children: [{ text: 'Project B' }], id: 'project-b', type: KEYS.p },
    ]);

    assert.equal(applySupertag(editor, 'project-a', 'project-tag'), true);
    assert.equal(applySupertag(editor, 'project-b', 'project-tag'), true);
    assert.deepEqual(buildTanaIndex(editor.children).nodesBySupertag.get('project-tag'), [
      'project-a',
      'project-b',
    ]);

    assert.equal(navigateToNode(editor, 'project-tag'), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'project-tag');
  });
});
