import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { ElementApi } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  getTanaAncestorPaths,
  getTanaNodePath,
  isTanaNodeInteractable,
} from '@/lib/tana/outliner';
import type { NodeId } from '@/lib/tana/types';

const EMPTY_OPEN_IDS = new Set<string>();

export const TANA_ZOOM_PLUGIN_KEY = 'tanaZoom' as const;

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

function pruneBlockSelection(editor: PlateEditor) {
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

function reveal(editor: PlateEditor, targetNodeId: NodeId) {
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

function focus(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (!targetEntry) return false;

  const [targetNode, targetPath] = targetEntry;

  reveal(editor, targetNodeId);
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

function zoomTo(editor: PlateEditor, targetNodeId: NodeId) {
  if (!getTanaNodeEntry(editor, targetNodeId)) return false;

  editor.setOption(TanaZoomPlugin, 'focusedNodeId', targetNodeId);
  reveal(editor, targetNodeId);
  pruneBlockSelection(editor);

  return focus(editor, targetNodeId);
}

function zoomRoot(editor: PlateEditor) {
  editor.setOption(TanaZoomPlugin, 'focusedNodeId', null);
  pruneBlockSelection(editor);

  return true;
}

function zoomOut(editor: PlateEditor) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId) return false;

  const focusedPath = getTanaNodePath(editor.children, focusedNodeId);
  const parentPath = focusedPath
    ? getTanaAncestorPaths(editor.children, focusedPath).at(-1)
    : undefined;
  const parent = parentPath ? editor.api.node(parentPath)?.[0] : null;
  const parentId = parent && 'id' in parent ? parent.id : null;

  if (typeof parentId === 'string') return zoomTo(editor, parentId);

  return zoomRoot(editor);
}

function resetInvalid(editor: PlateEditor) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId || getTanaNodeEntry(editor, focusedNodeId)) return false;

  return zoomRoot(editor);
}

/** Plate owns the sole Zoom state and all Tana-specific navigation transforms. */
export const TanaZoomPlugin = createPlatePlugin<
  typeof TANA_ZOOM_PLUGIN_KEY,
  { focusedNodeId: NodeId | null }
>({
  key: TANA_ZOOM_PLUGIN_KEY,
  options: {
    focusedNodeId: null,
  },
  priority: 0,
})
  .extendEditorApi(({ editor }) => ({
    zoom: {
      focus: (nodeId: NodeId) => focus(editor, nodeId),
      pruneBlockSelection: () => pruneBlockSelection(editor),
      resetInvalid: () => resetInvalid(editor),
      reveal: (nodeId: NodeId) => reveal(editor, nodeId),
    },
  }))
  .extendEditorTransforms(({ editor }) => ({
    zoom: {
      out: () => zoomOut(editor),
      root: () => zoomRoot(editor),
      to: (nodeId: NodeId) => zoomTo(editor, nodeId),
    },
  }))
  .overrideEditor(({ editor, getOption, tf: { escape } }) => ({
    transforms: {
      escape: () => {
        if (!getOption('focusedNodeId')) return escape();

        return zoomOut(editor);
      },
    },
  }));
