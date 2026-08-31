import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { KEYS, normalizeNodeId, type NodeEntry, type TElement, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { BlockSelectionKit } from '@/components/editor/plugins/block-selection-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  canDropOnInteractableTanaNode,
  toggleTanaNodeCollapse,
} from '@/components/ui/block-draggable';
import { isTanaNodeElement } from './constants';
import { buildTanaIndex, getNodeReferenceCandidates } from './index';
import {
  getTanaAncestorPaths,
  getTanaNodeDescendantPaths,
  getTanaParentPath,
  getTanaParentPaths,
  getTanaZoomRange,
  hasTanaNodeDescendants,
  isTanaNodeCollapsed,
  isTanaNodeHidden,
  isTanaNodeInteractable,
} from './outliner';

const outliner: Value = [
  { children: [{ text: 'Parent' }], id: 'parent', type: 'p' },
  { children: [{ text: 'Child' }], id: 'child', indent: 1, type: 'p' },
  { children: [{ text: 'Sibling' }], id: 'sibling', type: 'p' },
];

function navigateToNode(editor: ReturnType<typeof createPlateEditor>, nodeId: string) {
  return editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
}

function zoomToTanaNode(editor: ReturnType<typeof createPlateEditor>, nodeId: string) {
  return editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
}

function resetInvalidTanaZoom(editor: ReturnType<typeof createPlateEditor>) {
  return editor.getApi(TanaZoomPlugin).zoom.resetInvalid();
}

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
      plugins: [TanaZoomPlugin, TogglePlugin, ...BlockSelectionKit],
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

  test('removes collapsed descendants from interaction while preserving the document', () => {
    const nestedOutliner: Value = [
      { children: [{ text: 'A' }], id: 'a', type: KEYS.h1 },
      {
        children: [{ text: 'B' }],
        id: 'b',
        indent: 1,
        tanaFieldValues: { priority: { type: 'number', value: 1 } },
        type: KEYS.blockquote,
      },
      { children: [{ text: 'C' }], id: 'c', indent: 2, type: KEYS.p },
      { children: [{ text: 'D' }], id: 'd', indent: 1, type: KEYS.p },
      { children: [{ text: 'E' }], id: 'e', type: KEYS.p },
    ];
    const editor = createPlateEditor({
      plugins: [TanaZoomPlugin, TogglePlugin, ...BlockSelectionKit],
      value: structuredClone(nestedOutliner),
    });
    const originalDocument = structuredClone(editor.children);
    const selection = editor.getApi(BlockSelectionPlugin).blockSelection;

    editor.getApi(TogglePlugin).toggle.toggleIds(['a', 'b'], true);
    editor.tf.select([2], { edge: 'start' });
    toggleTanaNodeCollapse(editor, 'a', [0]);

    const collapsedOpenIds =
      editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(isTanaNodeHidden(editor.children, [1], collapsedOpenIds), true);
    assert.equal(
      isTanaNodeInteractable(editor.children, [0], collapsedOpenIds, null),
      true
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [1], collapsedOpenIds, null),
      false
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [2], collapsedOpenIds, null),
      false
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [3], collapsedOpenIds, null),
      false
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [4], collapsedOpenIds, null),
      true
    );
    assert.deepEqual(editor.selection?.anchor.path, [0, 0]);
    assert.deepEqual(editor.selection?.focus.path, [0, 0]);

    selection.selectAll();
    assert.deepEqual(
      selection.getNodes({ sort: true }).map(([node]) => node.id),
      ['a', 'e']
    );

    const bEntry = editor.api.node({ at: [], id: 'b' }) as
      | NodeEntry<TElement>
      | undefined;
    const eEntry = editor.api.node({ at: [], id: 'e' }) as
      | NodeEntry<TElement>
      | undefined;

    assert.ok(bEntry);
    assert.ok(eEntry);
    assert.equal(
      canDropOnInteractableTanaNode({
        dragEntry: eEntry,
        dragItem: { editorId: editor.id, element: eEntry[0], id: 'e' },
        dropEntry: bEntry,
        editor,
      }),
      false
    );
    assert.equal(
      canDropOnInteractableTanaNode({
        dragEntry: bEntry,
        dragItem: { editorId: editor.id, element: bEntry[0], id: 'b' },
        dropEntry: eEntry,
        editor,
      }),
      false
    );
    assert.equal(navigateToNode(editor, 'b'), true);

    const expandedOpenIds =
      editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(expandedOpenIds.has('a'), true);
    assert.equal(expandedOpenIds.has('b'), true);
    assert.deepEqual(editor.selection?.anchor.path, [1, 0]);
    assert.equal(
      isTanaNodeInteractable(editor.children, [1], expandedOpenIds, null),
      true
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [2], expandedOpenIds, null),
      true
    );
    assert.equal(
      isTanaNodeInteractable(editor.children, [3], expandedOpenIds, null),
      true
    );
    assert.deepEqual(editor.children, originalDocument);
    assert.equal(editor.children[1].id, 'b');
    assert.deepEqual(editor.children[1].tanaFieldValues, {
      priority: { type: 'number', value: 1 },
    });
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
        tanaFieldValues: { status: { type: 'plain', value: 'Active' } },
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
      status: { type: 'plain', value: 'Active' },
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

  test('derives Zoom ranges without changing the Plate document', () => {
    const zoomOutliner: Value = [
      { children: [{ text: 'A' }], id: 'a', type: KEYS.h1 },
      {
        children: [{ text: 'B' }],
        id: 'b',
        indent: 1,
        tanaFieldValues: { status: { type: 'plain', value: 'Active' } },
        type: KEYS.blockquote,
      },
      { children: [{ text: 'C' }], id: 'c', indent: 2, type: KEYS.p },
      { children: [{ text: 'D' }], id: 'd', indent: 1, type: KEYS.p },
      { children: [{ text: 'E' }], id: 'e', type: KEYS.p },
    ];
    const originalDocument = structuredClone(zoomOutliner);
    const ids = (paths: number[][]) =>
      paths.map((path) => zoomOutliner[path[0]].id);

    assert.deepEqual(ids(getTanaZoomRange(zoomOutliner, 'b')), ['b', 'c']);
    assert.deepEqual(ids(getTanaZoomRange(zoomOutliner, 'c')), ['c']);
    assert.deepEqual(getTanaAncestorPaths(zoomOutliner, [2]), [[0], [1]]);
    assert.equal(
      zoomOutliner[
        getTanaAncestorPaths(zoomOutliner, [2]).at(-1)?.[0] ?? -1
      ]?.id,
      'b'
    );
    assert.equal(
      isTanaNodeInteractable(zoomOutliner, [0], new Set(['a', 'b']), 'b'),
      false
    );
    assert.equal(
      isTanaNodeInteractable(zoomOutliner, [1], new Set(['a', 'b']), 'b'),
      true
    );
    assert.equal(
      isTanaNodeInteractable(zoomOutliner, [2], new Set(['a', 'b']), 'b'),
      true
    );
    assert.deepEqual(ids(getTanaZoomRange(zoomOutliner, 'a')), [
      'a',
      'b',
      'c',
      'd',
    ]);
    assert.deepEqual(ids(getTanaZoomRange(zoomOutliner, null)), [
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    assert.deepEqual(getTanaZoomRange(zoomOutliner, 'missing-node'), []);
    assert.deepEqual(zoomOutliner, originalDocument);
    assert.equal(zoomOutliner[1].id, 'b');
    assert.equal(zoomOutliner[1].indent, 1);
    assert.deepEqual(zoomOutliner[1].tanaFieldValues, {
      status: { type: 'plain', value: 'Active' },
    });
  });

  test('navigation reveals a collapsed reference target without changing it', () => {
    const editor = createPlateEditor({
      plugins: [TanaZoomPlugin, TogglePlugin],
      value: [
        { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
        { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
        {
          children: [{ text: 'C' }],
          id: 'c',
          indent: 2,
          tanaFieldValues: { effort: { type: 'number', value: 3 } },
          type: KEYS.blockquote,
        },
      ],
    });
    const originalDocument = structuredClone(editor.children);

    assert.equal(navigateToNode(editor, 'c'), true);

    const openIds = editor.getOptions(TogglePlugin).openIds ?? new Set<string>();

    assert.equal(openIds.has('a'), true);
    assert.equal(openIds.has('b'), true);
    assert.deepEqual(editor.selection?.anchor.path, [2, 0]);
    assert.deepEqual(getTanaZoomRange(editor.children, 'c'), [[2]]);
    assert.deepEqual(editor.children, originalDocument);
    assert.equal(editor.children[2].id, 'c');
    assert.deepEqual(editor.children[2].tanaFieldValues, {
      effort: { type: 'number', value: 3 },
    });
  });

  test('uses the Zoom plugin state for block selection and DnD eligibility', () => {
    const editor = createPlateEditor({
      plugins: [TanaZoomPlugin, TogglePlugin, ...BlockSelectionKit],
      value: [
        { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
        { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
        { children: [{ text: 'C' }], id: 'c', indent: 2, type: KEYS.p },
        { children: [{ text: 'D' }], id: 'd', indent: 1, type: KEYS.p },
        { children: [{ text: 'E' }], id: 'e', type: KEYS.p },
      ],
    });
    const blockSelection = editor.getApi(BlockSelectionPlugin).blockSelection;

    editor.getApi(TogglePlugin).toggle.toggleIds(['a', 'b'], true);
    blockSelection.set(['a', 'e']);

    assert.equal(zoomToTanaNode(editor, 'a'), true);
    assert.deepEqual(
      blockSelection.getNodes({ sort: true }).map(([node]) => node.id),
      ['a']
    );

    assert.equal(zoomToTanaNode(editor, 'b'), true);
    blockSelection.selectAll();
    assert.deepEqual(
      blockSelection.getNodes({ sort: true }).map(([node]) => node.id),
      ['b', 'c']
    );

    const bEntry = editor.api.node({ at: [], id: 'b' }) as NodeEntry<TElement>;
    const eEntry = editor.api.node({ at: [], id: 'e' }) as NodeEntry<TElement>;

    assert.equal(
      canDropOnInteractableTanaNode({
        dragEntry: eEntry,
        dragItem: { editorId: editor.id, element: eEntry[0], id: 'e' },
        dropEntry: bEntry,
        editor,
      }),
      false
    );
  });

  test('returns the Plate Zoom option to workspace root after deletion', () => {
    const editor = createPlateEditor({
      plugins: [TanaZoomPlugin, TogglePlugin, ...BlockSelectionKit],
      value: [
        { children: [{ text: 'A' }], id: 'a', type: KEYS.p },
        { children: [{ text: 'B' }], id: 'b', indent: 1, type: KEYS.p },
      ],
    });

    assert.equal(zoomToTanaNode(editor, 'b'), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'b');

    editor.tf.removeNodes({ at: [1] });

    assert.equal(resetInvalidTanaZoom(editor), true);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), null);
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
            fields: [],
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
            status: { type: 'plain', value: 'Active' },
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
        ['status', { type: 'plain', value: 'Active' }],
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
      assert.equal(navigateToNode(editor, 'project'), true);
      assert.equal(editor.selection?.anchor.path[0], 1);
    }
  });
});
