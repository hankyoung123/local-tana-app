import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { findElementIdsHiddenInToggle } from '@platejs/toggle/react';
import { KEYS, normalizeNodeId, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';
import { buildTanaIndex, getNodeReferenceCandidates } from './index';
import {
  getTanaParentPaths,
  getTanaParentPathsNeedingToggle,
} from './outliner';
import { promoteTanaParentsToToggles } from '@/components/tana/tana-outliner-behavior';

const outliner: Value = [
  { children: [{ text: 'Parent' }], id: 'parent', type: 'p' },
  { children: [{ text: 'Child' }], id: 'child', indent: 1, type: 'p' },
  { children: [{ text: 'Sibling' }], id: 'sibling', type: 'p' },
];

describe('Tana outliner behavior', () => {
  test('uses one NodeId predicate for every top-level block type', () => {
    let nextId = 0;
    const normalized = normalizeNodeId(
      [
        {
          children: [
            {
              children: [{ text: 'Nested' }],
              type: KEYS.p,
            },
          ],
          type: KEYS.p,
        },
        {
          children: [{ text: 'Display heading' }],
          type: KEYS.h1,
        },
        {
          children: [{ text: 'Display quote' }],
          type: KEYS.blockquote,
        },
      ],
      {
        filter: isTanaNodeElement,
        idCreator: () => `top-level-id-${++nextId}`,
      }
    );

    assert.equal((normalized[0] as { id?: unknown }).id, 'top-level-id-1');
    assert.equal('id' in normalized[0].children[0], false);
    assert.equal(isTanaNodeElement(normalized[0], [0]), true);
    assert.equal(
      isTanaNodeElement(normalized[0].children[0] as never, [0, 0]),
      false
    );
    assert.equal((normalized[1] as { id?: unknown }).id, 'top-level-id-2');
    assert.equal(isTanaNodeElement(normalized[1], [1]), true);
    assert.equal((normalized[2] as { id?: unknown }).id, 'top-level-id-3');
    assert.equal(isTanaNodeElement(normalized[2], [2]), true);
  });

  test('uses Plate Block Selection only for Tana nodes', () => {
    assert.equal(isTanaNodeElement(outliner[0], [0]), true);
    assert.equal(isTanaNodeElement(outliner[1], [0, 0]), false);
    assert.equal(
      isTanaNodeElement(
        { children: [{ text: '' }], id: 'nested-cell', type: 'td' },
        [3, 0]
      ),
      false
    );

    const editor = createPlateEditor({
      plugins: [
        BlockSelectionPlugin.configure({
          options: { isSelectable: isTanaNodeElement },
        }),
      ],
      value: [
        outliner[0],
        {
          children: [{ text: 'Heading' }],
          id: 'heading',
          type: KEYS.h1,
        },
        {
          children: [{ text: 'Quote' }],
          id: 'quote',
          type: KEYS.blockquote,
        },
        outliner[2],
      ],
    });
    const selection = editor.getApi(BlockSelectionPlugin).blockSelection;

    selection.selectAll();

    assert.deepEqual(
      selection.getNodes().map(([node]) => node.id),
      ['parent', 'heading', 'quote', 'sibling']
    );
  });

  test('promotes an ordinary parent and keeps its child visible with Plate Toggle', () => {
    assert.deepEqual(getTanaParentPaths(outliner), [[0]]);
    assert.deepEqual(getTanaParentPathsNeedingToggle(outliner), [[0]]);
    assert.deepEqual(
      getTanaParentPathsNeedingToggle([
        { children: [{ text: 'Heading parent' }], id: 'heading', type: KEYS.h1 },
        { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
      ]),
      [[0]]
    );

    const editor = createPlateEditor({
      plugins: [TogglePlugin],
      value: structuredClone(outliner),
    });
    const paths = getTanaParentPathsNeedingToggle(editor.children);

    promoteTanaParentsToToggles(editor, paths);

    assert.equal(editor.children[0].type, KEYS.toggle);
    assert.deepEqual(
      findElementIdsHiddenInToggle(
        editor.getOptions(TogglePlugin).openIds ?? new Set<string>(),
        editor.children as never
      ),
      []
    );
  });

  test('keeps a NodeId and Tana semantics through presentation changes', () => {
    const editor = createPlateEditor({
      nodeId: {
        filter: isTanaNodeElement,
        initialValueIds: 'always',
      },
      plugins: EditorKit,
      value: [
        {
          children: [{ text: 'Project tag' }],
          id: 'project-tag',
          tanaSupertagDefinition: {
            fields: [{ id: 'status', name: 'Status', type: 'text' }],
          },
          type: KEYS.p,
        },
        {
          children: [
            { text: 'Project ' },
            {
              children: [{ text: '' }],
              key: 'project-tag',
              type: 'tana_supertag',
            },
          ],
          id: 'project',
          tanaFieldValues: {
            status: { type: 'text', value: 'Active' },
          },
          type: KEYS.p,
        },
        {
          children: [
            { text: 'Discuss ' },
            {
              children: [{ text: '' }],
              key: 'project',
              type: KEYS.mention,
            },
          ],
          id: 'task',
          type: KEYS.p,
        },
      ],
    });
    const transitions = [
      { type: KEYS.h1 },
      { type: KEYS.blockquote },
      { [KEYS.listType]: KEYS.listTodo, type: KEYS.p },
      { type: KEYS.toggle },
    ];

    for (const props of transitions) {
      editor.tf.setNodes(props, { at: [1] });

      const project = editor.children[1];
      const index = buildTanaIndex(editor.children);

      assert.equal(project.id, 'project');
      assert.equal(index.nodesById.get('project')?.id, 'project');
      assert.deepEqual(index.fieldValues.get('project'), new Map([
        ['status', { type: 'text', value: 'Active' }],
      ]));
      assert.deepEqual(index.nodesBySupertag.get('project-tag'), ['project']);
      assert.deepEqual(index.backlinks.get('project'), [
        {
          path: [2, 1],
          sourceNodeId: 'task',
          targetNodeId: 'project',
        },
      ]);
      assert.equal(
        getNodeReferenceCandidates(editor.children).some(
          ({ id }) => id === 'project'
        ),
        true
      );
    }
  });
});
