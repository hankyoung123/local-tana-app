import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { ElementApi } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from './constants';
import {
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeInteractable,
} from './outliner';
import type { NodeId } from './types';

const EMPTY_OPEN_IDS = new Set<string>();

export const TANA_ZOOM_PLUGIN_KEY = 'tanaZoom' as const;

/** Plate owns the sole Zoom state and its Escape fallback. */
export const TanaZoomPlugin = createPlatePlugin<
  typeof TANA_ZOOM_PLUGIN_KEY,
  { focusedNodeId: NodeId | null }
>({
  key: TANA_ZOOM_PLUGIN_KEY,
  options: {
    focusedNodeId: null,
  },
  priority: 0,
}).overrideEditor(({ editor, getOption, tf: { escape } }) => ({
  transforms: {
    escape: () => {
      if (!getOption('focusedNodeId')) return escape();

      return zoomOutTanaNode(editor);
    },
  },
}));

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry) return;

  const [node, path] = entry;

  return ElementApi.isElement(node) && isTanaNodeElement(node, path)
    ? entry
    : undefined;
}

function getFocusedNodeId(editor: PlateEditor) {
  return editor.getOption(TanaZoomPlugin, 'focusedNodeId');
}

/**
 * Removes only IDs that are outside the one shared interaction predicate.
 * Plate Block Selection remains the only selection state.
 */
export function pruneTanaBlockSelection(editor: PlateEditor) {
  if (!editor.plugins[BlockSelectionPlugin.key]) return;

  const openIds = editor.getOption(TogglePlugin, 'openIds') ?? EMPTY_OPEN_IDS;
  const focusedNodeId = getFocusedNodeId(editor);
  const blockSelection = editor.getApi(BlockSelectionPlugin).blockSelection;
  const interactableIds = blockSelection
    .getNodes({ sort: true })
    .flatMap(([node, path]) =>
      isTanaNodeInteractable(
        editor.children,
        path,
        openIds,
        focusedNodeId
      ) && typeof node.id === 'string'
        ? [node.id]
        : []
    );

  blockSelection.set(interactableIds);
}

/** Opens flat-indent ancestors through Plate Toggle's existing openIds. */
export function revealTanaNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (!targetEntry) return false;

  const [, targetPath] = targetEntry;
  const ancestorIds = getTanaAncestorPaths(editor.children, targetPath).flatMap(
    (path) => {
      const ancestor = editor.api.node(path)?.[0];
      const id = ancestor && 'id' in ancestor ? ancestor.id : undefined;

      return typeof id === 'string' ? [id] : [];
    }
  );

  if (ancestorIds.length > 0) {
    editor.getApi(TogglePlugin).toggle.toggleIds(ancestorIds, true);
  }

  return true;
}

/** Places the Plate caret and focus on an already-resolved Tana Node. */
export function focusTanaNode(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  revealTanaNode(editor, targetNodeId);
  editor.tf.select(targetPath);
  editor.tf.focus();

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      editor.api.toDOMNode(targetNode)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  return true;
}

/** Sets the sole Plate-owned Zoom state, then focuses the target NodeId. */
export function zoomToTanaNode(editor: PlateEditor, targetNodeId: NodeId) {
  if (!getTanaNodeEntry(editor, targetNodeId)) return false;

  editor.setOption(TanaZoomPlugin, 'focusedNodeId', targetNodeId);
  revealTanaNode(editor, targetNodeId);
  pruneTanaBlockSelection(editor);

  return focusTanaNode(editor, targetNodeId);
}

/** Returns to the indent parent or the canonical workspace root. */
export function zoomOutTanaNode(editor: PlateEditor) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId) return false;

  const focusedPath = getTanaNodePath(editor.children, focusedNodeId);
  const parentPath = focusedPath
    ? getTanaAncestorPaths(editor.children, focusedPath).at(-1)
    : undefined;
  const parent = parentPath ? editor.api.node(parentPath)?.[0] : null;
  const parentId = parent && 'id' in parent ? parent.id : null;

  if (typeof parentId === 'string') {
    return zoomToTanaNode(editor, parentId);
  }

  return zoomToTanaWorkspaceRoot(editor);
}

/** Returns the editor to the canonical workspace root. */
export function zoomToTanaWorkspaceRoot(editor: PlateEditor) {
  editor.setOption(TanaZoomPlugin, 'focusedNodeId', null);
  pruneTanaBlockSelection(editor);

  return true;
}

/** Restores the canonical root when a focused NodeId no longer exists. */
export function resetInvalidTanaZoom(editor: PlateEditor) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId || getTanaNodeEntry(editor, focusedNodeId)) return false;

  editor.setOption(TanaZoomPlugin, 'focusedNodeId', null);
  pruneTanaBlockSelection(editor);

  return true;
}
