import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement, TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';
import { runTanaQuery } from '@/lib/tana/query';
import type { TanaQueryExpression } from '@/lib/tana/types';
import { TanaReferencePlugin } from './tana-reference-plugin';

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
});
