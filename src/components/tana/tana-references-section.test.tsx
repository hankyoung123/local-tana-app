import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor, Plate } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana';

import {
  getReferenceBreadcrumb,
  getTanaReferenceBacklinkTitle,
  getTanaReferenceGroups,
  navigateTanaReferenceRelation,
  TanaReferencesSection,
} from './tana-references-section';

describe('Tana References section', () => {
  test('groups derived backlinks by relation kind without changing their document order', () => {
    const value: Value = [
      {
        children: [{ text: 'Workspace' }],
        id: 'workspace',
        tanaSystemNode: 'workspace',
        type: KEYS.p,
      },
      { children: [{ text: 'Target' }], id: 'target', indent: 1, type: KEYS.p },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 1, type: KEYS.p },
      {
        children: [
          { text: 'Mention ' },
          { children: [{ text: '' }], key: 'target', type: KEYS.mention },
        ],
        id: 'inline-source',
        indent: 2,
        type: KEYS.p,
      },
      { children: [{ text: 'Projects' }], id: 'projects', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Reference' }],
        id: 'node-source',
        indent: 2,
        tanaReferenceTargetId: 'target',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);

    assert.deepEqual(
      getTanaReferenceGroups(index, 'target').map((group) => ({
        kind: group.kind,
        label: group.label,
        sourceNodeIds: group.relations.map((relation) => relation.sourceNodeId),
      })),
      [
        { kind: 'inline', label: 'Mentioned in', sourceNodeIds: ['inline-source'] },
        { kind: 'node', label: 'Referenced in', sourceNodeIds: ['node-source'] },
      ]
    );
  });

  test('orders ancestor labels from workspace to the direct parent', () => {
    const value: Value = [
      {
        children: [{ text: 'Workspace' }],
        id: 'workspace',
        tanaSystemNode: 'workspace',
        type: KEYS.p,
      },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, type: KEYS.p },
      { children: [{ text: 'Notes' }], id: 'notes', indent: 2, type: KEYS.p },
      { children: [{ text: 'Source' }], id: 'source', indent: 3, type: KEYS.p },
    ];

    assert.equal(
      getReferenceBreadcrumb(buildTanaIndex(value), 'source'),
      '工作区 / Home / Notes'
    );
  });

  test('uses canonical titles for block backlinks and focuses the exact inline occurrence', () => {
    const value: Value = [
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      {
        children: [
          { text: 'See ' },
          { children: [{ text: '' }], key: 'target', type: KEYS.mention },
        ],
        id: 'inline-source',
        type: KEYS.p,
      },
      { children: [{ text: 'Stale occurrence title' }], id: 'node-source', tanaReferenceTargetId: 'target', type: KEYS.p },
    ];
    const index = buildTanaIndex(value);
    const inline = index.references.find((relation) => relation.kind === 'inline');
    const block = index.references.find((relation) => relation.kind === 'node');
    const editor = createPlateEditor({
      nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
      plugins: EditorKit,
      value,
    });

    assert.ok(inline);
    assert.ok(block);
    assert.equal(getTanaReferenceBacklinkTitle(index, block), 'Target');
    assert.equal(navigateTanaReferenceRelation(editor, inline), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'inline-source');
    assert.deepEqual(editor.selection?.anchor.path, [1, 1, 0]);
  });

  test('keeps References navigable as a collapsible surface and exposes derived unlinked mentions', () => {
    const value: Value = [
      { children: [{ text: 'Project' }], id: 'target', type: KEYS.p },
      { children: [{ text: 'Project plan' }], id: 'source', type: KEYS.p },
    ];
    const index = buildTanaIndex(value);
    const editor = createPlateEditor({
      nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
      plugins: EditorKit,
      value,
    });
    const markup = renderToStaticMarkup(
      <Plate editor={editor}>
        <TanaReferencesSection index={index} nodeId="target" />
      </Plate>
    );

    assert.match(markup, /aria-expanded="true"/);
    assert.match(markup, /未链接提及/);
    assert.match(markup, />关联</);
  });
});
