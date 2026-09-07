import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { TogglePlugin } from '@platejs/toggle/react';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement, TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';
import { runTanaQuery } from '@/lib/tana/query';
import type { TanaQueryExpression } from '@/lib/tana/types';
import { TanaReferencePlugin } from './tana-reference-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('Tana Reference projection mutations', () => {
  test('writes a projected title into the canonical target without copying metadata to the Reference Node', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagIds: ['project-tag'],
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project tag' }],
        id: 'project-tag',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Old copied title' }],
        id: 'project-reference',
        tanaReferenceTargetId: 'project',
        type: KEYS.p,
      },
    ]);
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.setTargetTitle('project-reference', 'Must not edit occurrence'), false);
    assert.equal(reference.setTargetTitle('project', 'Renamed project'), true);
    assert.equal(editor.children[0].id, 'project');
    assert.deepEqual(editor.children[0].children, [{ text: 'Renamed project' }]);
    assert.equal(
      (editor.children[0] as { tanaSupertagIds?: readonly string[] }).tanaSupertagIds?.[0],
      'project-tag'
    );
    assert.equal(editor.children[2].id, 'project-reference');
    assert.equal(editor.children[2].tanaReferenceTargetId, 'project');
    assert.equal(buildTanaIndex(editor.children).nodesById.get('project')?.text, 'Renamed project');
  });

  test('edits only the canonical title leaf and preserves rich child content and metadata', () => {
    const editor = createEditor([
      {
        children: [
          { bold: true, text: 'Draft project' },
          { text: ' for ' },
          { children: [{ text: '' }], key: 'related', type: KEYS.mention },
          { text: ' ' },
          { children: [{ text: '' }], key: 'project-tag', type: TANA_SUPERTAG_KEY },
          { text: '' },
          {
            children: [{ italic: true, text: 'Documentation' }],
            type: KEYS.link,
            url: 'https://example.test/docs',
          },
          { text: '' },
        ],
        id: 'project',
        tanaSupertagIds: ['project-tag'],
        type: KEYS.p,
      },
      { children: [{ text: 'Related' }], id: 'related', type: KEYS.p },
      {
        children: [{ text: 'Project' }],
        id: 'project-tag',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Reference projection' }],
        id: 'project-reference',
        tanaReferenceTargetId: 'project',
        type: KEYS.p,
      },
    ]);
    const beforeRichSuffix = structuredClone(editor.children[0].children.slice(1));
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.setTargetTitle('project', 'Renamed project'), true);

    const project = editor.children.find((node) => node.id === 'project');
    const index = buildTanaIndex(editor.children);

    assert.equal(project?.id, 'project');
    assert.equal(project?.children[0]?.text, 'Renamed project');
    assert.equal(project?.children[0]?.bold, true);
    assert.deepEqual(project?.children.slice(1), beforeRichSuffix);
    assert.deepEqual(project?.tanaSupertagIds, ['project-tag']);
    assert.deepEqual(index.backlinks.get('related')?.map(({ sourceNodeId }) => sourceNodeId), ['project']);
    assert.deepEqual(index.backlinks.get('project')?.map(({ sourceNodeId }) => sourceNodeId), [
      'project-reference',
    ]);
    assert.deepEqual(
      runTanaQuery(index, {
        children: [{ predicate: { kind: 'text-contains', text: 'renamed project' }, type: 'predicate' }],
        type: 'and',
      }).map(({ id }) => id),
      ['project']
    );
  });

  test('only creates a block Reference to an existing canonical target', () => {
    const editor = createEditor([
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', type: KEYS.p },
    ]);
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.setTarget('reference', 'missing'), false);
    assert.equal(reference.setTarget('reference', 'target'), true);
    assert.equal(reference.setTarget('reference', 'target'), false);
    assert.equal(editor.children[1].tanaReferenceTargetId, 'target');
  });

  test('rejects a Reference occurrence as a new block Reference target', () => {
    const editor = createEditor([
      { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
      { children: [{ text: 'B occurrence' }], id: 'b', tanaReferenceTargetId: 'a', type: KEYS.p },
      { children: [{ text: 'C' }], id: 'c', type: KEYS.p },
    ]);
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.setTarget('c', 'b'), false);
    assert.equal(editor.children[2].tanaReferenceTargetId, undefined);
    assert.equal(reference.setTarget('c', 'a'), true);
    assert.equal(editor.children[2].tanaReferenceTargetId, 'a');
  });

  test('edits a canonical target in a Workspace without routing that editor write through Trash', () => {
    const editor = createEditor([
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', indent: 2, type: KEYS.p },
      {
        children: [{ text: 'Project reference' }],
        id: 'project-reference',
        indent: 2,
        tanaReferenceTargetId: 'project',
        type: KEYS.p,
      },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
    ]);

    assert.equal(
      editor.getTransforms(TanaReferencePlugin).reference.setTargetTitle('project', 'Renamed'),
      true
    );
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get('project'), 'home');
    assert.equal(editor.children.find((node) => node.id === 'project')?.children[0].text, 'Renamed');
  });

  test('updates Search results from the same canonical projection title edit', () => {
    const editor = createEditor([
      { children: [{ text: 'Project plan' }], id: 'project', type: KEYS.p },
      {
        children: [{ text: 'Project search' }],
        id: 'search',
        tanaSearchDefinition: {
          query: {
            children: [{ predicate: { kind: 'text-contains', text: 'project' }, type: 'predicate' }],
            type: 'and',
          },
        },
        type: KEYS.p,
      },
    ]);
    const query = (
      editor.children[1] as {
        tanaSearchDefinition?: { query: TanaQueryExpression };
      }
    ).tanaSearchDefinition?.query;

    assert.ok(query);

    assert.deepEqual(runTanaQuery(buildTanaIndex(editor.children), query).map(({ id }) => id), [
      'project',
      'search',
    ]);
    assert.equal(
      editor.getTransforms(TanaReferencePlugin).reference.setTargetTitle('project', 'Archived'),
      true
    );
    assert.deepEqual(runTanaQuery(buildTanaIndex(editor.children), query).map(({ id }) => id), [
      'search',
    ]);
    assert.equal(editor.children.some((node) => node.id === 'project'), true);
  });

  test('brings a canonical subtree to its Reference occurrence with one undoable ownership swap', () => {
    const editor = createEditor([
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'project', indent: 2, type: KEYS.p },
      { children: [{ text: 'Canonical child' }], id: 'project-child', indent: 3, type: KEYS.p },
      { children: [{ text: 'Between' }], id: 'between', indent: 2, type: KEYS.p },
      { children: [{ text: 'Project occurrence' }], id: 'project-reference', indent: 2, tanaReferenceTargetId: 'project', type: KEYS.p },
      { children: [{ text: 'Tail' }], id: 'tail', indent: 2, type: KEYS.p },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
    ]);
    editor.getApi(TogglePlugin).toggle.toggleIds(['workspace', 'home'], true);
    const before = structuredClone(editor.children);
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.bringHere('project-reference'), true);
    const after = structuredClone(editor.children);
    assert.deepEqual(
      editor.children.slice(2, 7).map((node) => node.id),
      ['project-reference', 'between', 'project', 'project-child', 'tail']
    );
    assert.equal(editor.children[2].tanaReferenceTargetId, 'project');
    assert.equal(editor.children[4].id, 'project');
    assert.equal(editor.children[5].id, 'project-child');
    const index = buildTanaIndex(editor.children);
    assert.equal(index.parentNodeIds.get('project'), 'home');
    assert.equal(index.parentNodeIds.get('project-child'), 'project');
    assert.deepEqual(index.backlinks.get('project')?.map(({ sourceNodeId }) => sourceNodeId), ['project-reference']);
    editor.tf.undo();
    assert.deepEqual(editor.children, before);
    editor.tf.redo();
    assert.deepEqual(editor.children, after);
  });

  test('rejects Bring here through an owner descendant, Trash, or a system target', () => {
    const editor = createEditor([
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Owner' }], id: 'owner', indent: 2, type: KEYS.p },
      { children: [{ text: 'Descendant occurrence' }], id: 'descendant-reference', indent: 3, tanaReferenceTargetId: 'owner', type: KEYS.p },
      { children: [{ text: 'Live occurrence' }], id: 'trash-reference', indent: 2, tanaReferenceTargetId: 'trashed-target', type: KEYS.p },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
      { children: [{ text: 'Trashed target' }], id: 'trashed-target', indent: 2, type: KEYS.p },
      { children: [{ text: 'System occurrence' }], id: 'system-reference', indent: 2, tanaReferenceTargetId: 'home', type: KEYS.p },
    ]);
    const before = structuredClone(editor.children);
    const reference = editor.getTransforms(TanaReferencePlugin).reference;

    assert.equal(reference.bringHere('descendant-reference'), false);
    assert.equal(reference.bringHere('trash-reference'), false);
    assert.equal(reference.bringHere('system-reference'), false);
    assert.deepEqual(editor.children, before);
  });

  test('keeps the complete subtree when the Reference precedes its canonical owner', () => {
    const editor = createEditor([
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Occurrence' }], id: 'reference', indent: 2, tanaReferenceTargetId: 'target', type: KEYS.p },
      { children: [{ text: 'Between' }], id: 'between', indent: 2, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', indent: 2, type: KEYS.p },
      { children: [{ text: 'Child' }], id: 'child', indent: 3, type: KEYS.p },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
    ]);
    editor.getApi(TogglePlugin).toggle.toggleIds(['workspace', 'home'], true);

    assert.equal(editor.getTransforms(TanaReferencePlugin).reference.bringHere('reference'), true);
    assert.deepEqual(
      editor.children.slice(2, 6).map((node) => node.id),
      ['target', 'child', 'between', 'reference']
    );
    assert.equal(editor.children[2].indent, 2);
    assert.equal(editor.children[3].indent, 3);
    assert.equal(editor.children[5].tanaReferenceTargetId, 'target');
  });

  test('edits a Reference projection by focusing its complete canonical rich title', () => {
    const editor = createEditor([
      {
        children: [
          { bold: true, text: 'Project' },
          { text: ' with ' },
          { children: [{ text: '' }], key: 'related', type: KEYS.mention },
        ],
        id: 'project',
        type: KEYS.p,
      },
      { children: [{ text: 'Related' }], id: 'related', type: KEYS.p },
      { children: [{ text: '' }], id: 'project-reference', tanaReferenceTargetId: 'project', type: KEYS.p },
    ]);

    assert.equal(editor.getTransforms(TanaReferencePlugin).reference.editTarget('project-reference'), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'project');
    assert.equal(editor.selection?.anchor.path[0], 0);
    assert.deepEqual(editor.children[0].children, [
      { bold: true, text: 'Project' },
      { text: ' with ' },
      { children: [{ text: '' }], key: 'related', type: KEYS.mention },
    ]);
    assert.equal(editor.children[2].tanaReferenceTargetId, 'project');
  });
});
