import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { isTanaNodeElement } from './constants';
import { initialDocument } from './initial-document';
import { buildTanaIndex } from './index';
import { isValidTanaDocument } from './persistence';
import { validateWorkspaceStructure } from './workspace';

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

function minimalWorkspace(): Value {
  return [
    { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: 'p' },
    { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: 'p' },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
  ];
}

function check(document: Value): boolean {
  return validateWorkspaceStructure(document, buildTanaIndex(document));
}

describe('canonical Tana workspace document', () => {
  test('derives the system workspace hierarchy from explicit Node markers', () => {
    const index = buildTanaIndex(initialDocument);

    assert.equal(index.systemNodeIds.get('workspace'), 'workspace-root');
    assert.equal(index.systemNodeIds.get('home'), 'home');
    assert.equal(index.systemNodeIds.get('schema'), 'schema');
    assert.equal(index.systemNodeIds.get('library'), 'library');
    assert.equal(index.systemNodeIds.get('settings'), 'settings');
    assert.equal(index.systemNodeIds.get('trash'), 'trash');
    assert.equal(index.parentNodeIds.get('home'), 'workspace-root');
    assert.equal(index.parentNodeIds.get('supertag-project'), 'schema');
    assert.equal(index.parentNodeIds.get('field-summary'), 'schema');
    assert.deepEqual(index.childrenByParent.get('workspace-root'), [
      'home',
      'daily-notes',
      'schema',
      'library',
      'settings',
      'trash',
    ]);
  });

  test('keeps system hierarchy and Node-level Supertag membership through JSON persistence', () => {
    const loaded = JSON.parse(JSON.stringify(initialDocument));
    const index = buildTanaIndex(loaded);

    assert.equal(isValidTanaDocument(loaded), true);
    assert.deepEqual(index.nodesById.get('node-project-example')?.supertagIds, [
      'supertag-project',
    ]);
    assert.deepEqual(index.nodesBySupertag.get('supertag-project'), [
      'node-project-example',
    ]);
    assert.equal(index.parentNodeIds.get('node-project-example'), 'home');
  });

  test('validates the canonical skeleton only from tanaSystemNode markers', () => {
    assert.equal(check(initialDocument), true);
    assert.equal(isValidTanaDocument(initialDocument), true);
    assert.equal(check(minimalWorkspace()), true);
    assert.equal(isValidTanaDocument(minimalWorkspace()), true);
  });

  test('rejects missing system Nodes', () => {
    const missingSchema = minimalWorkspace().filter(
      (node) => (node as { id?: string }).id !== 'schema'
    );
    const missingHome = minimalWorkspace().filter(
      (node) => (node as { id?: string }).id !== 'home'
    );

    assert.equal(check(missingSchema), false);
    assert.equal(isValidTanaDocument(missingSchema), false);
    assert.equal(check(missingHome), false);
    assert.equal(isValidTanaDocument(missingHome), false);
  });

  test('rejects duplicate system Nodes', () => {
    const duplicateHome: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Home 2' }], id: 'home-2', indent: 1, tanaSystemNode: 'home', type: 'p' },
    ];
    const duplicateTrash: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Trash 2' }], id: 'trash-2', indent: 1, tanaSystemNode: 'trash', type: 'p' },
    ];
    const duplicateWorkspace: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Workspace 2' }], id: 'ws-2', tanaSystemNode: 'workspace', type: 'p' },
    ];

    assert.equal(check(duplicateHome), false);
    assert.equal(isValidTanaDocument(duplicateHome), false);
    assert.equal(check(duplicateTrash), false);
    assert.equal(isValidTanaDocument(duplicateTrash), false);
    assert.equal(check(duplicateWorkspace), false);
    assert.equal(isValidTanaDocument(duplicateWorkspace), false);
  });

  test('rejects system Nodes outside Workspace direct children', () => {
    const schemaUnderHome: Value = minimalWorkspace().map((node) => {
      if ((node as { id?: string }).id === 'schema') {
        return { ...node, indent: 2 };
      }

      return node;
    });
    const libraryOutside: Value = minimalWorkspace().map((node) => {
      if ((node as { id?: string }).id === 'library') {
        return { ...node, indent: 0 };
      }

      return node;
    });

    assert.equal(check(schemaUnderHome), false);
    assert.equal(isValidTanaDocument(schemaUnderHome), false);
    assert.equal(check(libraryOutside), false);
    assert.equal(isValidTanaDocument(libraryOutside), false);
  });

  test('keeps Field Definition ownership unrestricted', () => {
    const definitionUnderSchema: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
      { children: [{ text: 'Status' }], id: 'status', indent: 2, tanaFieldDefinition: { type: 'plain' }, type: 'p' },
    ];
    const localUnderSupertag: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
      { children: [{ text: 'Priority' }], id: 'priority', indent: 3, tanaFieldDefinition: { type: 'plain' }, type: 'p' },
    ];
    const definitionUnderHome: Value = [
      ...minimalWorkspace(),
      { children: [{ text: 'Priority' }], id: 'priority', indent: 2, tanaFieldDefinition: { type: 'plain' }, type: 'p' },
    ];

    for (const document of [definitionUnderSchema, localUnderSupertag, definitionUnderHome]) {
      assert.equal(check(document), true);
      assert.equal(isValidTanaDocument(document), true);
    }

    const index = buildTanaIndex(localUnderSupertag);

    assert.equal(index.parentNodeIds.get('priority'), 'project');
  });

  test('keeps system identity on the original Node after a Plate split', () => {
    const editor = createEditor(minimalWorkspace());

    editor.tf.select({
      anchor: { offset: 3, path: [3, 0] },
      focus: { offset: 3, path: [3, 0] },
    });
    editor.tf.insertBreak();

    const schema = editor.children.find((node) => node.id === 'schema');
    const schemaCount = editor.children.filter(
      (node) => (node as { tanaSystemNode?: string }).tanaSystemNode === 'schema'
    ).length;

    assert.equal((schema as { tanaSystemNode?: string } | undefined)?.tanaSystemNode, 'schema');
    // Only the original Schema keeps the marker; the split sibling is ordinary.
    assert.equal(schemaCount, 1);
    assert.equal(editor.children.length, 8);
    assert.equal(
      (editor.children[4] as { tanaSystemNode?: string }).tanaSystemNode,
      undefined
    );
    assert.notEqual(editor.children[4].id, 'schema');
  });

  test('blocks direct and block-selected removal of system Nodes but keeps ordinary deletes native', () => {
    const editor = createEditor([
      ...minimalWorkspace(),
      { children: [{ text: 'Note' }], id: 'note', indent: 2, type: KEYS.p },
    ]);

    const before = structuredClone(editor.children);
    const schemaPath = editor.children.findIndex((node) => node.id === 'schema');

    editor.tf.removeNodes({ at: [schemaPath] });

    assert.deepEqual(editor.children, before);

    editor.getApi(BlockSelectionPlugin).blockSelection.set('schema');

    editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();

    assert.deepEqual(editor.children, before);
    assert.ok(editor.children.some((node) => node.id === 'schema'));

    const notePath = editor.children.findIndex((node) => node.id === 'note');

    editor.tf.removeNodes({ at: [notePath] });

    assert.equal(editor.children.some((node) => node.id === 'note'), false);
    assert.ok(editor.children.some((node) => node.id === 'schema'));
  });

  test('restores a mis-indented system Node as a Workspace direct child without creating Nodes', () => {
    const editor = createEditor(minimalWorkspace());

    editor.tf.setNodes({ indent: 2 }, { at: [3] });

    const schema = editor.children.find((node) => node.id === 'schema');

    assert.equal(schema?.indent, 1);
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('schema'), 'ws');
  });

  test('creates a shared template occurrence and a direct local Definition, then materializes on apply', () => {
    const editor = createEditor([
      ...minimalWorkspace(),
      { children: [{ text: 'Status' }], id: 'status', indent: 2, tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: KEYS.p },
      { children: [{ text: '' }], id: 'shared-input', indent: 3, type: KEYS.p },
      { children: [{ text: '' }], id: 'local-input', indent: 3, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', indent: 2, type: KEYS.p },
    ]);
    const fields = editor.getTransforms(TanaFieldPlugin).field;

    const sharedId = fields.completeTemplateInput('shared-input', 'project', { fieldId: 'status' });

    assert.equal(sharedId, 'status');
    assert.equal(
      editor.children.find((node) => node.id === 'shared-input')?.tanaFieldId,
      'status'
    );

    const localId = fields.completeTemplateInput('local-input', 'project', {
      name: 'Priority',
      type: 'create',
    });

    assert.equal(localId, 'local-input');
    assert.deepEqual(
      editor.children.find((node) => node.id === 'local-input')?.tanaFieldDefinition,
      { type: 'plain' }
    );

    assert.equal(editor.getTransforms(TanaSupertagPlugin).supertag.apply('task', 'project'), true);

    const index = buildTanaIndex(editor.children);
    const applied = (index.fieldNodesByParent.get('task') ?? []).map(({ fieldId }) => fieldId);

    assert.deepEqual(applied, ['status', 'local-input']);
  });
});
