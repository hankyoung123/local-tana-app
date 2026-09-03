import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana/constants';

import { TanaViewPlugin } from './tana-view-plugin';

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

function view(editor: ReturnType<typeof createEditor>) {
  return editor.getTransforms(TanaViewPlugin).view;
}

const value: Value = [
  { children: [{ text: 'Tasks' }], id: 'view', type: KEYS.p },
  {
    children: [{ text: 'Project' }],
    id: 'project',
    tanaSupertagDefinition: {},
    type: KEYS.p,
  },
  {
    children: [{ text: 'Person' }],
    id: 'person',
    tanaSupertagDefinition: {},
    type: KEYS.p,
  },
  {
    children: [{ text: 'Status' }],
    id: 'status',
    tanaFieldDefinition: { type: 'options' },
    type: KEYS.p,
  },
  { children: [{ text: 'Active' }], id: 'active', indent: 1, type: KEYS.p },
  { children: [{ text: 'Inactive' }], id: 'inactive', indent: 1, type: KEYS.p },
  {
    children: [{ text: 'Owner' }],
    id: 'owner',
    tanaFieldDefinition: { sourceSupertagId: 'person', type: 'from-supertag' },
    type: KEYS.p,
  },
  {
    children: [
      { text: 'Ada ' },
      { children: [{ text: '' }], key: 'person', type: TANA_SUPERTAG_KEY },
    ],
    id: 'ada',
    type: KEYS.p,
  },
  { children: [{ text: 'Grace' }], id: 'grace', type: KEYS.p },
];

describe('Tana view mutations', () => {
  test('defines and removes a View without changing its NodeId', () => {
    const editor = createEditor(value);

    assert.equal(view(editor).define('view'), true);
    assert.equal(editor.children[0].id, 'view');
    assert.deepEqual(editor.children[0].tanaViewDefinition, { type: 'outline' });
    assert.equal(view(editor).define('view'), false);
    assert.equal(view(editor).remove('view'), true);
    assert.equal(editor.children[0].id, 'view');
    assert.equal(editor.children[0].tanaViewDefinition, undefined);
  });

  test('changes only View presentation while keeping the Search definition untouched', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Tasks' }],
        id: 'view',
        tanaSearchDefinition: { query: { children: [], type: 'and' } },
        tanaViewDefinition: { type: 'outline' },
        type: KEYS.p,
      },
    ]);

    assert.equal(view(editor).setType('view', 'table'), true);
    assert.deepEqual(editor.children[0].tanaViewDefinition, { type: 'table' });
    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      query: { children: [], type: 'and' },
    });

    assert.equal(view(editor).setType('view', 'calendar'), true);
    assert.deepEqual(editor.children[0].tanaViewDefinition, { type: 'calendar' });
    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      query: { children: [], type: 'and' },
    });

    assert.equal(view(editor).setType('view', 'cards'), true);
    assert.deepEqual(editor.children[0].tanaViewDefinition, { type: 'cards' });
    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      query: { children: [], type: 'and' },
    });
  });

  test('composes a View with a Supertag Definition without changing either Node semantic', () => {
    const editor = createEditor(value);
    const supertagDefinition = structuredClone(
      editor.children[1].tanaSupertagDefinition
    );

    assert.equal(view(editor).define('project'), true);
    assert.equal(editor.children[1].id, 'project');
    assert.deepEqual(editor.children[1].tanaSupertagDefinition, supertagDefinition);
    assert.deepEqual(editor.children[1].tanaViewDefinition, { type: 'outline' });
    assert.equal(view(editor).remove('project'), true);
    assert.equal(editor.children[1].tanaViewDefinition, undefined);
    assert.deepEqual(editor.children[1].tanaSupertagDefinition, supertagDefinition);
  });

  test('composes a View with a Field Definition without changing either Node semantic', () => {
    const editor = createEditor(value);
    const fieldDefinition = structuredClone(editor.children[3].tanaFieldDefinition);

    assert.equal(view(editor).define('status'), true);
    assert.equal(editor.children[3].id, 'status');
    assert.deepEqual(editor.children[3].tanaFieldDefinition, fieldDefinition);
    assert.deepEqual(editor.children[3].tanaViewDefinition, { type: 'outline' });
    assert.equal(view(editor).remove('status'), true);
    assert.equal(editor.children[3].tanaViewDefinition, undefined);
    assert.deepEqual(editor.children[3].tanaFieldDefinition, fieldDefinition);
  });

});
