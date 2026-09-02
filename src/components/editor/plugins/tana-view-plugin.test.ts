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
    assert.deepEqual(editor.children[0].tanaViewDefinition, { clauses: [] });
    assert.equal(view(editor).define('view'), false);
    assert.equal(view(editor).remove('view'), true);
    assert.equal(editor.children[0].id, 'view');
    assert.equal(editor.children[0].tanaViewDefinition, undefined);
  });

  test('composes a View with a Supertag Definition without changing either Node semantic', () => {
    const editor = createEditor(value);
    const supertagDefinition = structuredClone(
      editor.children[1].tanaSupertagDefinition
    );

    assert.equal(view(editor).define('project'), true);
    assert.equal(editor.children[1].id, 'project');
    assert.deepEqual(editor.children[1].tanaSupertagDefinition, supertagDefinition);
    assert.deepEqual(editor.children[1].tanaViewDefinition, { clauses: [] });
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
    assert.deepEqual(editor.children[3].tanaViewDefinition, { clauses: [] });
    assert.equal(view(editor).remove('status'), true);
    assert.equal(editor.children[3].tanaViewDefinition, undefined);
    assert.deepEqual(editor.children[3].tanaFieldDefinition, fieldDefinition);
  });

  test('rejects invalid NodeId relations when adding clauses', () => {
    const editor = createEditor(value);
    const transforms = view(editor);

    assert.equal(transforms.define('view'), true);
    assert.equal(
      transforms.addClause('view', { kind: 'has-supertag', supertagId: 'grace' }),
      false
    );
    assert.equal(
      transforms.addClause('view', { fieldId: 'project', kind: 'field-defined' }),
      false
    );
    assert.equal(
      transforms.addClause('view', {
        fieldId: 'status',
        kind: 'field-equals',
        value: { type: 'options', value: 'grace' },
      }),
      false
    );
    assert.equal(
      transforms.addClause('view', {
        fieldId: 'owner',
        kind: 'field-equals',
        value: { type: 'from-supertag', value: 'grace' },
      }),
      false
    );
    assert.deepEqual(editor.children[0].tanaViewDefinition, { clauses: [] });
  });

  test('saves valid clauses and removes only the requested clause', () => {
    const editor = createEditor(value);
    const transforms = view(editor);
    const first = { kind: 'has-supertag', supertagId: 'project' } as const;
    const second = {
      fieldId: 'status',
      kind: 'field-equals',
      value: { type: 'options', value: 'active' },
    } as const;
    const third = {
      fieldId: 'owner',
      kind: 'field-equals',
      value: { type: 'from-supertag', value: 'ada' },
    } as const;
    const fourth = { kind: 'text-contains', text: 'Ada' } as const;

    assert.equal(transforms.define('view'), true);
    assert.equal(transforms.addClause('view', first), true);
    assert.equal(transforms.addClause('view', second), true);
    assert.equal(transforms.addClause('view', third), true);
    assert.equal(transforms.addClause('view', fourth), true);
    assert.deepEqual(editor.children[0].tanaViewDefinition, {
      clauses: [first, second, third, fourth],
    });
    assert.equal(transforms.removeClause('view', 1), true);
    assert.deepEqual(editor.children[0].tanaViewDefinition, {
      clauses: [first, third, fourth],
    });
    assert.equal(transforms.removeClause('view', 4), false);
  });
});
