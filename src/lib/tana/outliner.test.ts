import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, normalizeNodeId, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';
import { buildTanaIndex, getNodeReferenceCandidates } from './index';
import {
  getTanaNodeDescendantPaths,
  getTanaParentPath,
  getTanaParentPaths,
  hasTanaNodeDescendants,
  isTanaNodeCollapsed,
  isTanaNodeHidden,
} from './outliner';

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

  test('derives hierarchy for every presentation without changing node types', () => {
    const styledOutliner: Value = [
      { children: [{ text: 'Heading parent' }], id: 'heading', type: KEYS.h1 },
      { children: [{ text: 'Heading child' }], id: 'heading-child', indent: 1, type: KEYS.p },
      { children: [{ text: 'Quote parent' }], id: 'quote', type: KEYS.blockquote },
      { children: [{ text: 'Quote child' }], id: 'quote-child', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Todo parent' }],
        id: 'todo',
        [KEYS.listType]: KEYS.listTodo,
        type: KEYS.p,
      },
      { children: [{ text: 'Todo child' }], id: 'todo-child', indent: 1, type: KEYS.p },
    ];

    assert.deepEqual(getTanaParentPaths(styledOutliner), [[0], [2], [4]]);
    assert.deepEqual(getTanaParentPath(styledOutliner, [1]), [0]);
    assert.deepEqual(getTanaNodeDescendantPaths(styledOutliner, [2]), [[3]]);
    assert.equal(hasTanaNodeDescendants(styledOutliner, [0]), true);
    assert.equal(hasTanaNodeDescendants(styledOutliner, [1]), false);
    assert.equal(styledOutliner[0].type, KEYS.h1);
    assert.equal(styledOutliner[2].type, KEYS.blockquote);
    assert.equal(styledOutliner[4].type, KEYS.p);
    assert.equal(styledOutliner[4][KEYS.listType], KEYS.listTodo);
  });

  test('uses Plate openIds to collapse without changing the document', () => {
    const collapsibleOutliner: Value = [
      {
        children: [{ text: 'Heading parent' }],
        id: 'heading',
        tanaFieldValues: { status: { type: 'text', value: 'Active' } },
        type: KEYS.h1,
      },
      { children: [{ text: 'Heading child' }], id: 'heading-child', indent: 1, type: KEYS.p },
      { children: [{ text: 'Quote parent' }], id: 'quote', type: KEYS.blockquote },
      { children: [{ text: 'Quote child' }], id: 'quote-child', indent: 1, type: KEYS.p },
      {
        children: [{ text: 'Todo parent' }],
        id: 'todo',
        [KEYS.listType]: KEYS.listTodo,
        type: KEYS.p,
      },
      { children: [{ text: 'Todo child' }], id: 'todo-child', indent: 1, type: KEYS.p },
    ];
    const editor = createPlateEditor({
      plugins: EditorKit,
      value: structuredClone(collapsibleOutliner),
    });

    editor
      .getApi(TogglePlugin)
      .toggle.toggleIds(['heading', 'quote', 'todo'], true);

    let openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(isTanaNodeCollapsed(editor.children, [0], openIds), false);
    assert.equal(isTanaNodeHidden(editor.children, [1], openIds), false);

    editor.tf.setNodes({ type: KEYS.blockquote }, { at: [0] });
    openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(editor.children[0].id, 'heading');
    assert.equal(editor.children[0].type, KEYS.blockquote);
    assert.equal(isTanaNodeCollapsed(editor.children, [0], openIds), false);
    assert.equal(isTanaNodeHidden(editor.children, [1], openIds), false);
    assert.deepEqual(editor.children[0].tanaFieldValues, {
      status: { type: 'text', value: 'Active' },
    });

    const beforeCollapse = structuredClone(editor.children);

    editor.getApi(TogglePlugin).toggle.toggleIds(['heading']);
    openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(isTanaNodeCollapsed(editor.children, [0], openIds), true);
    assert.equal(isTanaNodeHidden(editor.children, [1], openIds), true);
    assert.deepEqual(editor.children, beforeCollapse);

    editor.getApi(TogglePlugin).toggle.toggleIds(['heading']);
    openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(isTanaNodeCollapsed(editor.children, [0], openIds), false);
    assert.equal(isTanaNodeHidden(editor.children, [1], openIds), false);
    assert.equal(editor.children[1].id, 'heading-child');
  });

  test('leaves an existing Plate Toggle presentation untouched', () => {
    assert.deepEqual(
      getTanaParentPaths([
        { children: [{ text: 'Toggle parent' }], id: 'toggle', type: KEYS.toggle },
        { children: [{ text: 'Child' }], id: 'child', indent: 1, type: KEYS.p },
      ]),
      [[0]]
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
