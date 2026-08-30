import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';
import {
  bindFieldToSupertag,
  completeSupertagFieldTemplateInput,
  createFieldDefinition,
  findFieldDefinitionExactMatch,
  getFieldDefinitionCandidates,
  getFieldValueCandidates,
  getSupertagFieldBindings,
  hasFieldDefinitionExactMatch,
  isFieldValueCompatible,
  isSupertagFieldInputNode,
  prioritizeFieldDefinitionCandidates,
} from './fields';
import { TANA_FIELD_INPUT_KEY } from './constants';
import { buildTanaIndex } from './index';
import { applySupertag } from './supertag';

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

describe('Tana field nodes', () => {
  test('uses the Plate NodeId for a Field Definition and Supertag binding', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
    ]);

    const fieldId = createFieldDefinition(editor, 'Summary', { type: 'plain' });

    assert.equal(fieldId, 'node-1');
    assert.equal(editor.children[1].id, fieldId);
    assert.deepEqual(editor.children[1].tanaFieldDefinition, { type: 'plain' });
    assert.equal(bindFieldToSupertag(editor, 'project', fieldId!), true);
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId }],
    });
  });

  test('resolves field names from the current Field Definition node text', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'owner' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
    ]);

    assert.equal(
      getSupertagFieldBindings(buildTanaIndex(editor.children), 'project')[0]
        ?.field.text,
      'Owner'
    );

    editor.tf.select([1, 0], { edge: 'end' });
    editor.tf.insertText(' name');

    assert.equal(
      getSupertagFieldBindings(buildTanaIndex(editor.children), 'project')[0]
        ?.field.text,
      'Owner name'
    );
  });

  test('keeps a binding without an explicit default unset when applied', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [{ fieldId: 'priority' }] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(applySupertag(editor, 'task', 'project'), true);
    assert.equal(editor.children[2].tanaFieldValues, undefined);
  });

  test('does not instantiate a default whose type conflicts with its Field Definition', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {
          fields: [
            {
              defaultValue: { type: 'plain', value: 'not a number' },
              fieldId: 'estimate',
            },
          ],
        },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Estimate' }],
        id: 'estimate',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    ]);

    assert.equal(
      isFieldValueCompatible(
        { type: 'number' },
        { type: 'plain', value: 'not a number' }
      ),
      false
    );
    assert.equal(applySupertag(editor, 'task', 'project'), true);
    assert.equal(editor.children[2].tanaFieldValues, undefined);
  });

  test('preserves an existing instance value when a Field Definition type changes', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaFieldValues: {
          priority: { type: 'plain', value: 'High' },
        },
        type: KEYS.p,
      },
    ]);

    editor.tf.setNodes(
      { tanaFieldDefinition: { type: 'number' } },
      { at: [0] }
    );

    assert.deepEqual(editor.children[1].tanaFieldValues, {
      priority: { type: 'plain', value: 'High' },
    });
    assert.equal(
      isFieldValueCompatible(
        { type: 'number' },
        { type: 'plain', value: 'High' }
      ),
      false
    );
  });

  test('creates a bound Field Definition at the end of its parent subtree', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Summary' }],
        id: 'summary',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Outside Project' }],
        id: 'outside',
        type: KEYS.p,
      },
    ]);

    const fieldId = createFieldDefinition(
      editor,
      'Priority',
      { type: 'number' },
      'project'
    );

    assert.equal(fieldId, 'node-1');
    assert.equal(editor.children[2].id, fieldId);
    assert.equal(editor.children[2].indent, 1);
    assert.deepEqual(editor.children[2].tanaFieldDefinition, { type: 'number' });
    assert.equal(editor.children[3].id, 'outside');
    assert.equal(bindFieldToSupertag(editor, 'project', fieldId!), true);
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId }],
    });
  });

  test('triggers the Plate Field Combobox only from a transient Supertag template node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template', indent: 1, type: KEYS.p },
      {
        children: [{ text: '' }],
        id: 'field',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'option', indent: 2, type: KEYS.p },
      { children: [{ text: '' }], id: 'outside', type: KEYS.p },
    ]);

    assert.equal(isSupertagFieldInputNode(editor.children, [1]), true);
    assert.equal(isSupertagFieldInputNode(editor.children, [2]), false);
    assert.equal(isSupertagFieldInputNode(editor.children, [3]), false);
    assert.equal(isSupertagFieldInputNode(editor.children, [4]), false);

    editor.tf.select([1, 0], { edge: 'end' });
    editor.tf.insertText('>');

    assert.equal(
      editor.children[1].children.some(
        (child) => child.type === TANA_FIELD_INPUT_KEY
      ),
      true
    );

    editor.tf.select([2, 0], { edge: 'end' });
    editor.tf.insertText('>');

    assert.equal(editor.children[2].children[0].text, '>');

    editor.tf.select([3, 0], { edge: 'end' });
    editor.tf.insertText('>');

    assert.equal(editor.children[3].children[0].text, '>');

    editor.tf.select([4, 0], { edge: 'end' });
    editor.tf.insertText('>');

    assert.equal(editor.children[4].children[0].text, '>');
  });

  test('removes an escaped Field Combobox input without changing its temporary Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template', indent: 1, type: KEYS.p },
    ]);
    const before = structuredClone(editor.children);

    editor.tf.select([1, 0], { edge: 'end' });
    editor.tf.insertText('>');

    const input = Array.from(
      editor.api.nodes({
        at: [1],
        match: (node) => node.type === TANA_FIELD_INPUT_KEY,
      })
    )[0];

    assert.ok(input);
    editor.tf.removeNodes({ at: input![1] });

    assert.deepEqual(editor.children, before);
  });

  test('prioritizes an exact Field Definition and does not offer a duplicate creation', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'High Priority' }],
        id: 'high-priority',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Priority' }],
        id: 'priority',
        tanaFieldDefinition: { type: 'number' },
        type: KEYS.p,
      },
    ]);
    const candidates = getFieldDefinitionCandidates(editor.children);
    const prioritized = prioritizeFieldDefinitionCandidates(candidates, 'Priority');
    const exact = findFieldDefinitionExactMatch(editor.children, 'Priority');

    assert.deepEqual(
      prioritized.map(({ id }) => id),
      ['priority', 'high-priority']
    );
    assert.equal(hasFieldDefinitionExactMatch(candidates, 'Priority'), true);
    assert.equal(exact?.id, 'priority');
    assert.equal(
      completeSupertagFieldTemplateInput(editor, 'template', 'project', {
        fieldId: exact!.id,
      }),
      'priority'
    );
    assert.equal(
      editor.children.filter((node) => node.tanaFieldDefinition).length,
      2
    );
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId: 'priority' }],
    });
    assert.equal(editor.children.some((node) => node.id === 'template'), false);
    assert.equal(editor.api.block()?.[0].id, 'project');
  });

  test('does not mutate a non-transient node when completing a Field input', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'field',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
    ]);
    const before = structuredClone(editor.children);

    assert.equal(
      completeSupertagFieldTemplateInput(editor, 'field', 'project', {
        name: 'New field',
        type: 'create',
      }),
      undefined
    );
    assert.deepEqual(editor.children, before);
  });

  test('creates a plain Field Definition in the Supertag subtree and binds it', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Summary' }],
        id: 'summary',
        indent: 1,
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: '' }], id: 'template', indent: 1, type: KEYS.p },
      { children: [{ text: 'Outside' }], id: 'outside', type: KEYS.p },
    ]);

    const fieldId = completeSupertagFieldTemplateInput(
      editor,
      'template',
      'project',
      { name: 'Priority', type: 'create' }
    );

    assert.equal(fieldId, 'node-1');
    assert.deepEqual(editor.children[2], {
      children: [{ text: 'Priority' }],
      id: fieldId,
      indent: 1,
      tanaFieldDefinition: { type: 'plain' },
      type: KEYS.p,
    });
    assert.equal(editor.children[3].id, 'outside');
    assert.deepEqual(editor.children[0].tanaSupertagDefinition, {
      fields: [{ fieldId }],
    });
    assert.equal(editor.children.some((node) => node.id === 'template'), false);
    assert.equal(editor.api.block()?.[0].id, 'project');
  });

  test('derives From Supertag candidates only from the source tag instances', () => {
    const index = buildTanaIndex([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Person' }],
        id: 'person',
        tanaSupertagDefinition: { fields: [] },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Owner' }],
        id: 'owner',
        tanaFieldDefinition: {
          sourceSupertagId: 'person',
          type: 'from-supertag',
        },
        type: KEYS.p,
      },
      {
        children: [
          { text: 'Ada ' },
          { children: [{ text: '' }], key: 'person', type: 'tana_supertag' },
        ],
        id: 'ada',
        type: KEYS.p,
      },
      {
        children: [
          { text: 'Build ' },
          { children: [{ text: '' }], key: 'project', type: 'tana_supertag' },
        ],
        id: 'build',
        type: KEYS.p,
      },
    ]);

    const owner = index.nodesById.get('owner')!.fieldDefinition!;

    assert.deepEqual(
      getFieldValueCandidates(index, owner).map(({ id }) => id),
      ['ada']
    );
  });
});
