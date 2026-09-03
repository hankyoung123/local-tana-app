import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex, searchTanaNodes } from '@/lib/tana/index';
import { getTanaNodePath } from '@/lib/tana/outliner';
import { createAndQuery, runTanaQuery } from '@/lib/tana/query';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

function workspaceWithLifecycleSubtree(): Value {
  return [
    { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
    {
      children: [{ text: 'Project' }],
      id: 'project-node',
      indent: 2,
      tanaSupertagIds: ['project-tag'],
      type: KEYS.p,
    },
    { children: [{ text: '' }], id: 'project-status', indent: 3, tanaFieldId: 'status', type: KEYS.p },
    {
      children: [{ text: 'Open' }],
      id: 'project-status-value',
      indent: 4,
      tanaFieldValueType: 'plain',
      type: KEYS.p,
    },
    {
      children: [{ text: 'Project link' }],
      id: 'project-reference',
      indent: 2,
      tanaReferenceTargetId: 'project-node',
      type: KEYS.p,
    },
    { children: [{ text: 'Daily notes' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
    {
      children: [{ text: 'Status' }],
      id: 'status',
      indent: 2,
      tanaFieldDefinition: { type: 'plain' },
      type: KEYS.p,
    },
    {
      children: [{ text: 'Project tag' }],
      id: 'project-tag',
      indent: 2,
      tanaSupertagDefinition: {},
      type: KEYS.p,
    },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  ];
}

function lifecycle(editor: ReturnType<typeof createEditor>) {
  return editor.getTransforms(TanaNodeLifecyclePlugin).node;
}

describe('Tana Node lifecycle', () => {
  test('trashes a complete Field-bearing subtree without changing canonical NodeIds or relations', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());

    assert.equal(lifecycle(editor).trash('project-node'), true);
    assert.deepEqual(
      editor.children.map((node) => node.id),
      [
        'workspace',
        'home',
        'project-reference',
        'daily',
        'schema',
        'status',
        'project-tag',
        'library',
        'settings',
        'trash',
        'project-node',
        'project-status',
        'project-status-value',
      ]
    );
    assert.deepEqual(
      ['project-node', 'project-status', 'project-status-value'].map(
        (id) => editor.children.find((node) => node.id === id)?.indent
      ),
      [2, 3, 4]
    );

    const index = buildTanaIndex(editor.children);

    assert.deepEqual(index.nodesBySupertag.get('project-tag'), ['project-node']);
    assert.equal(index.fieldNodesById.get('project-status')?.valueNodeId, 'project-status-value');
    assert.deepEqual(index.backlinks.get('project-node')?.map(({ sourceNodeId }) => sourceNodeId), [
      'project-reference',
    ]);
  });

  test('restores a trashed subtree to Home without requiring placement history', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());

    assert.equal(lifecycle(editor).trash('project-node'), true);
    assert.equal(lifecycle(editor).restore('project-node'), true);

    assert.deepEqual(
      editor.children.slice(1, 6).map((node) => node.id),
      ['home', 'project-reference', 'project-node', 'project-status', 'project-status-value']
    );
    assert.equal(getTanaNodePath(editor.children, 'project-node')?.[0], 3);
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('project-node'), 'home');
  });

  test('keeps Trash subtrees indexed for references while excluding them from ordinary Search and View queries', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());
    const query = createAndQuery([{ kind: 'text-contains', text: 'Project' }]);

    assert.equal(
      runTanaQuery(buildTanaIndex(editor.children), query).some(({ id }) => id === 'project-node'),
      true
    );
    assert.equal(lifecycle(editor).trash('project-node'), true);

    const trashedIndex = buildTanaIndex(editor.children);

    assert.equal(trashedIndex.nodesById.has('project-node'), true);
    assert.deepEqual(trashedIndex.backlinks.get('project-node')?.map(({ sourceNodeId }) => sourceNodeId), [
      'project-reference',
    ]);
    assert.equal(
      runTanaQuery(trashedIndex, query).some(({ id }) => id === 'project-node'),
      false
    );
    assert.equal(
      searchTanaNodes(trashedIndex, 'project').some(({ id }) => id === 'project-node'),
      false
    );
    assert.deepEqual(
      runTanaQuery(trashedIndex, createAndQuery([{ kind: 'text-contains', text: 'Trash' }])),
      []
    );

    assert.equal(lifecycle(editor).restore('project-node'), true);

    const restoredIndex = buildTanaIndex(editor.children);

    assert.equal(
      runTanaQuery(restoredIndex, query).some(({ id }) => id === 'project-node'),
      true
    );
    assert.equal(
      searchTanaNodes(restoredIndex, 'project').some(({ id }) => id === 'project-node'),
      true
    );
  });

  test('permanently deletes only a Trash descendant and leaves its block Reference broken', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());

    assert.equal(lifecycle(editor).trash('project-node'), true);
    assert.equal(lifecycle(editor).deletePermanently('project-node'), true);

    const index = buildTanaIndex(editor.children);

    assert.equal(index.nodesById.has('project-node'), false);
    assert.equal(index.nodesById.has('project-status'), false);
    assert.equal(index.nodesById.has('project-status-value'), false);
    assert.equal(index.referenceTargetsByNode.get('project-reference'), 'project-node');
    assert.deepEqual(index.backlinks.get('project-node')?.map(({ sourceNodeId }) => sourceNodeId), [
      'project-reference',
    ]);
  });

  test('routes ordinary root removal into Trash and never permits system Nodes in lifecycle transforms', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());
    const projectPath = getTanaNodePath(editor.children, 'project-node');

    assert.ok(projectPath);
    editor.tf.removeNodes({ at: projectPath });

    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('project-node'), 'trash');
    assert.equal(lifecycle(editor).trash('home'), false);
    assert.equal(lifecycle(editor).deletePermanently('trash'), false);
    assert.equal(editor.children.find((node) => node.id === 'home')?.tanaSystemNode, 'home');
    assert.equal(editor.children.find((node) => node.id === 'trash')?.tanaSystemNode, 'trash');
  });

  test('routes normal block-selection deletion through the same Trash lifecycle', () => {
    const editor = createEditor(workspaceWithLifecycleSubtree());

    editor.getApi(BlockSelectionPlugin).blockSelection.set('project-node');
    editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes();

    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('project-node'), 'trash');
    assert.equal(buildTanaIndex(editor.children).fieldNodesById.get('project-status')?.parentNodeId, 'project-node');
  });
});
