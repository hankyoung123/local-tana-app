import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';
import { buildTanaIndex } from './index';
import { navigateToNode } from './navigation';
import { applySupertag, createSupertag, removeSupertag } from './supertag';
import type { FieldDefinition } from './types';
import { TanaZoomPlugin } from './zoom';

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

  test('derives tag display text from a renamed definition Node', () => {
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
    editor.tf.select([0, 0], { edge: 'end' });
    editor.tf.insertText(' Renamed');

    const index = buildTanaIndex(editor.children);
    const tag = tagElements(editor.children[1] as TElement)[0];

    assert.equal(index.nodesById.get('task')?.text.includes('#Project Renamed'), true);
    assert.equal('value' in (tag ?? {}), false);
  });

  test('leaves fields unset and preserves existing field values', () => {
    const fields: FieldDefinition[] = [
      { id: 'text', name: 'Text', type: 'text' },
      { id: 'number', name: 'Number', type: 'number' },
      { id: 'boolean', name: 'Boolean', type: 'boolean' },
      { id: 'date', name: 'Date', type: 'date' },
      { id: 'select', name: 'Select', options: ['A', 'B'], type: 'select' },
      { id: 'reference', name: 'Reference', type: 'node-reference' },
    ];
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: { fields },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Empty task' }],
        id: 'empty-task',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Existing task' }],
        id: 'existing-task',
        tanaFieldValues: { text: { type: 'text', value: 'Keep me' } },
        type: KEYS.p,
      },
    ]);

    assert.equal(applySupertag(editor, 'empty-task', 'project-tag'), true);
    assert.equal(applySupertag(editor, 'existing-task', 'project-tag'), true);
    assert.equal(editor.children[1].tanaFieldValues, undefined);
    assert.deepEqual(editor.children[2].tanaFieldValues, {
      text: { type: 'text', value: 'Keep me' },
    });
  });

  test('does not move another Node selection while applying a relation', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
      { children: [{ text: 'B' }], id: 'b', type: KEYS.p },
    ]);
    editor.tf.select([2, 0], { edge: 'end' });
    const selectionBeforeApply = structuredClone(editor.selection);
    const nodeBBeforeApply = structuredClone(editor.children[2]);

    assert.equal(applySupertag(editor, 'a', 'project-tag'), true);
    assert.deepEqual(editor.selection, selectionBeforeApply);
    assert.deepEqual(editor.children[2], nodeBBeforeApply);
  });

  test('removes only the relation while preserving field values and definition', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: {
          fields: [{ id: 'status', name: 'Status', type: 'text' }],
        },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(applySupertag(editor, 'task', 'project-tag'), true);
    editor.tf.setNodes(
      { tanaFieldValues: { status: { type: 'text', value: 'Active' } } },
      { at: [1] }
    );

    assert.equal(removeSupertag(editor, 'task', 'project-tag'), true);

    const index = buildTanaIndex(editor.children);

    assert.equal(index.nodesBySupertag.has('project-tag'), false);
    assert.deepEqual(editor.children[1].tanaFieldValues, {
      status: { type: 'text', value: 'Active' },
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
