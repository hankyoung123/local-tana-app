import { ElementApi, nanoid } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import type { TanaBlockElement } from '@/lib/tana/types';
import { TanaZoomPlugin } from './tana-zoom-plugin';

export const TANA_NODE_IDENTITY_PLUGIN_KEY = 'tanaNodeIdentity' as const;

const TANA_SEMANTIC_KEYS = [
  'tanaFieldDefinition',
  'tanaFieldId',
  'tanaFieldValueType',
  'tanaPresentation',
  'tanaReferenceTargetId',
  'tanaSearchDefinition',
  'tanaSupertagIds',
  'tanaSupertagDefinition',
  'tanaSystemNode',
  'tanaViewDefinition'
] as const;

function getTanaNodeAtCollapsedSelection(editor: PlateEditor) {
  const selection = editor.selection;

  if (
    !selection ||
    selection.anchor.offset !== selection.focus.offset ||
    selection.anchor.path.join() !== selection.focus.path.join()
  ) {
    return;
  }

  const path = [selection.anchor.path[0]];
  const entry = editor.api.node(path);

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, number[]])
    : undefined;
}

function isSelectionAtStart(editor: PlateEditor, path: number[]): boolean {
  const selection = editor.selection;

  return !!selection && editor.api.isStart(selection.anchor, path);
}

function isSystemNode(node: unknown): node is TanaBlockElement {
  return ElementApi.isElement(node as TElement) &&
    (node as TanaBlockElement).tanaSystemNode !== undefined;
}

function getSystemNodeAtPath(editor: PlateEditor, path: Path | undefined) {
  if (!path || path.length !== 1) return;

  const entry = editor.api.node(path);

  return entry && isSystemNode(entry[0]) ? (entry as [TanaBlockElement, Path]) : undefined;
}

function getNodeIndentAtPath(editor: PlateEditor, path: Path): number | undefined {
  const node = editor.api.node(path)?.[0];

  return ElementApi.isElement(node) && typeof node.indent === 'number'
    ? node.indent
    : ElementApi.isElement(node)
      ? 0
      : undefined;
}

function getCurrentBlockPath(editor: PlateEditor): Path | undefined {
  const entry = editor.api.block();

  return entry && isTanaNodeElement(entry) ? entry[1] : undefined;
}

function selectionHasProtectedOutdentNode(editor: PlateEditor): boolean {
  return Array.from(
    editor.api.nodes({ block: true, mode: 'lowest' })
  ).some(([node, path]) => {
    if (!ElementApi.isElement(node) || !isTanaNodeElement(node, path)) {
      return false;
    }

    if (isSystemNode(node)) return true;

    return (typeof node.indent === 'number' ? node.indent : 0) <= 1;
  });
}

function moveWouldPrecedeWorkspace(
  editor: PlateEditor,
  options: { to?: unknown }
): boolean {
  if (!Array.isArray(options.to) || options.to.length !== 1) return false;

  const workspaceIndex = editor.children.findIndex(
    (node) =>
      ElementApi.isElement(node) &&
      (node as TanaBlockElement).tanaSystemNode === 'workspace'
  );

  return workspaceIndex >= 0 && options.to[0] <= workspaceIndex;
}

function isAtBlockEdge(
  editor: PlateEditor,
  path: Path,
  edge: 'end' | 'start'
): boolean {
  const selection = editor.selection;

  return (
    !!selection &&
    !editor.api.isExpanded() &&
    (edge === 'start'
      ? editor.api.isStart(selection.anchor, path)
      : editor.api.isEnd(selection.anchor, path))
  );
}

function hasSystemMergeBoundary(
  editor: PlateEditor,
  edge: 'end' | 'start'
): boolean {
  const path = getCurrentBlockPath(editor);

  if (!path || !isAtBlockEdge(editor, path, edge)) return false;

  if (getSystemNodeAtPath(editor, path)) return true;

  const neighborIndex = path[0] + (edge === 'start' ? -1 : 1);
  const neighborPath: Path = [neighborIndex];

  return (
    neighborIndex >= 0 &&
    !!getSystemNodeAtPath(editor, neighborPath)
  );
}

function moveTargetsSystemNode(
  editor: PlateEditor,
  options: { at?: unknown; match?: unknown }
): boolean {
  if (Array.isArray(options.at)) {
    if (options.at.length === 1) {
      return !!getSystemNodeAtPath(editor, options.at);
    }

    if (options.at.length === 0) {
      const match = typeof options.match === 'function' ? options.match : undefined;

      return editor.children.some(
        (node, index) =>
          isSystemNode(node) && (!match || match(node, [index]))
      );
    }
  }

  return !!getSystemNodeAtPath(editor, getCurrentBlockPath(editor));
}

function removeTargetsSystemNode(
  editor: PlateEditor,
  options: { at?: unknown; match?: unknown }
): boolean {
  if (Array.isArray(options.at) && options.at.length === 1) {
    return !!getSystemNodeAtPath(editor, options.at);
  }

  if (Array.isArray(options.at) && options.at.length === 0) {
    return typeof options.match !== 'function';
  }

  return !!getSystemNodeAtPath(editor, getCurrentBlockPath(editor));
}

/**
 * Plate owns ordinary Node splitting. The focused Zoom Node is page Header
 * presentation, so Enter there deliberately leaves the document unchanged.
 */
export const TanaNodeIdentityPlugin = createPlatePlugin({
  key: TANA_NODE_IDENTITY_PLUGIN_KEY,
  // Run after Plate's indent transform so this narrow root-boundary guard can
  // decide before Shift+Tab applies its native outdent.
  priority: 1,
}).overrideEditor(({
  editor,
  tf: {
    deleteBackward,
    deleteForward,
    insertBreak,
    mergeNodes,
    moveNodes,
    removeNodes,
    tab,
  },
}) => ({
  transforms: {
    deleteBackward(unit) {
      if (hasSystemMergeBoundary(editor, 'start')) return;

      return deleteBackward(unit);
    },
    deleteForward(unit) {
      if (hasSystemMergeBoundary(editor, 'end')) return;

      return deleteForward(unit);
    },
    insertBreak() {
      const entry = getTanaNodeAtCollapsedSelection(editor);

      if (!entry || typeof entry[0].id !== 'string') return insertBreak();

      const [node, path] = entry;

      // Workspace is the unique root. It is a container boundary, not an
      // editable block that can split into another indent-0 Node.
      if (node.tanaSystemNode === 'workspace') return;

      const focusedNodeId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');

      if (focusedNodeId === node.id) return;

      const previousId = node.id;
      const selectionAtStart = isSelectionAtStart(editor, path);

      insertBreak();

      const rightPath = [path[0] + 1];
      const rightEntry = editor.api.node(rightPath);

      if (!rightEntry || !ElementApi.isElement(rightEntry[0])) return;

      if (selectionAtStart) {
        const rightId = typeof rightEntry[0].id === 'string' ? rightEntry[0].id : nanoid();

        // Slate copies node properties to the right split while retaining them
        // on the empty left block. Move the fresh ID left and the existing ID
        // right, then remove duplicate semantics from the new empty Node.
        editor.tf.setNodes({ id: rightId }, { at: path });
        TANA_SEMANTIC_KEYS.forEach((key) => editor.tf.unsetNodes(key, { at: path }));
        editor.tf.setNodes({ id: previousId }, { at: rightPath });
        return;
      }

      // At a middle/end split, Slate leaves the original Node on the left and
      // clones its properties to the right. Keep the original identity and
      // semantics on the left, then make the new right sibling ordinary.
      editor.tf.setNodes({ id: nanoid() }, { at: rightPath });
      TANA_SEMANTIC_KEYS.forEach((key) => editor.tf.unsetNodes(key, { at: rightPath }));
    },
    mergeNodes(options = {}) {
      const path = Array.isArray(options.at)
        ? options.at
        : getCurrentBlockPath(editor);
      const reverse = options.reverse === true;

      if (
        getSystemNodeAtPath(editor, path) ||
        (path &&
          path.length === 1 &&
          !!getSystemNodeAtPath(editor, [path[0] + (reverse ? 1 : -1)]))
      ) {
        return;
      }

      return mergeNodes(options);
    },
    moveNodes(options) {
      if (
        moveTargetsSystemNode(editor, options) ||
        moveWouldPrecedeWorkspace(editor, options)
      ) {
        return false;
      }

      return moveNodes(options);
    },
    removeNodes(options = {}) {
      if (removeTargetsSystemNode(editor, options)) return;

      if (Array.isArray(options.at) && options.at.length === 0) {
        const match = options.match;

        return removeNodes({
          ...options,
          match: (node, path) =>
            !isSystemNode(node) &&
            (typeof match !== 'function' || match(node, path)),
        });
      }

      return removeNodes(options);
    },
    tab(options) {
      if (options?.reverse === true && selectionHasProtectedOutdentNode(editor)) {
        return true;
      }

      if (getSystemNodeAtPath(editor, getCurrentBlockPath(editor))) return true;

      const path = getCurrentBlockPath(editor);

      // Keep Workspace as the unique root. Plate owns ordinary indentation,
      // except that Shift+Tab cannot outdent a non-workspace root child.
      if (
        options?.reverse === true &&
        path &&
        (getNodeIndentAtPath(editor, path) ?? 0) <= 1
      ) {
        return true;
      }

      return tab(options);
    },
  },
}));
