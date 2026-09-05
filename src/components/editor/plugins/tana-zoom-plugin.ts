import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { ElementApi } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import {
  getTanaAncestorPaths,
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaNodePath,
  hasTanaNodeDescendants,
  isTanaFieldNodePresentationHidden,
  isTanaNodeInteractable,
} from '@/lib/tana/outliner';
import { getNodeSemanticType } from '@/lib/tana/node-semantic';
import type { NodeId } from '@/lib/tana/types';

import { TanaSupertagPlugin } from './tana-supertag-plugin';

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

  if (
    !targetEntry ||
    isTanaFieldNodePresentationHidden(editor.children, targetEntry[1])
  ) {
    return false;
  }

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

function navigate(editor: PlateEditor, targetPath: number[]) {
  const point = editor.api.start(targetPath);

  if (!point) return false;

  return editor.tf.navigation.navigate({
    flash: false,
    focus: true,
    scroll: true,
    select: point,
    target: { path: targetPath, type: 'node' },
  });
}

function getTanaZoomBodyInsertionPath(editor: PlateEditor, hostPath: number[]) {
  const lastDirectChildPath = getTanaDirectChildPaths(editor.children, hostPath).at(-1);

  if (!lastDirectChildPath) return [hostPath[0] + 1];

  const lastDescendant = getTanaNodeDescendantPaths(
    editor.children,
    lastDirectChildPath
  ).at(-1);

  return [(lastDescendant ?? lastDirectChildPath)[0] + 1];
}

/**
 * Materializes the page-level Body affordance as one ordinary direct child.
 * It performs no projection or state tracking: the new Node immediately joins
 * the regular Plate editing flow.
 */
function insertZoomBodyChild(editor: PlateEditor, { select = true } = {}) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId) return false;

  const hostEntry = getTanaNodeEntry(editor, focusedNodeId);

  if (!hostEntry || !isTanaFieldHostNode(editor.children, hostEntry[1])) return false;

  if (!isTanaNodeInteractable(editor.children, hostEntry[1],
    editor.getOption(TogglePlugin, 'openIds') ?? EMPTY_OPEN_IDS, focusedNodeId)) return false;

  const [host, hostPath] = hostEntry;
  const childPath = getTanaZoomBodyInsertionPath(editor, hostPath);
  const indent = typeof host.indent === 'number' ? host.indent + 1 : 1;

  editor.tf.insertNodes(
    editor.api.create.block({ children: [{ text: '' }], indent }),
    { at: childPath }
  );
  const child = editor.api.node(childPath)?.[0];

  if (child && typeof child.id === 'string') {
    editor.getTransforms(TanaSupertagPlugin).supertag.applyDefaultChild(child.id);
  }
  editor.getApi(TogglePlugin).toggle.toggleIds([focusedNodeId], true);

  return select ? navigate(editor, childPath) : true;
}

function isEmptyZoomBodyChild(editor: PlateEditor, path: number[]) {
  const entry = editor.api.node(path);

  if (!entry || !ElementApi.isElement(entry[0])) return false;

  return (
    getNodeSemanticType(entry[0], {
      document: editor.children,
      path,
    }) === 'content' &&
    getTanaNodeDescendantPaths(editor.children, path).length === 0 &&
    entry[0].children.length === 1 &&
    'text' in entry[0].children[0] &&
    entry[0].children[0].text === ''
  );
}

/** Ensures the trailing body affordance is one ordinary, canonical Plate Node. */
function ensureZoomBodyChild(editor: PlateEditor) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId) return false;

  const hostEntry = getTanaNodeEntry(editor, focusedNodeId);

  if (!hostEntry || !isTanaFieldHostNode(editor.children, hostEntry[1])) return false;

  const directChildPaths = getTanaDirectChildPaths(editor.children, hostEntry[1]);
  const trailingChild = directChildPaths.at(-1);

  if (trailingChild && isEmptyZoomBodyChild(editor, trailingChild)) return true;

  // Once a page has ordinary body content, its normal Plate Enter workflow is
  // the insertion affordance. Do not materialize an extra empty Node merely
  // because the page was opened in Zoom.
  const hasOrdinaryBodyChild = directChildPaths.some((path) => {
    const entry = editor.api.node(path);

    return (
      !!entry &&
      ElementApi.isElement(entry[0]) &&
      getNodeSemanticType(entry[0], { document: editor.children, path }) === 'content'
    );
  });

  if (hasOrdinaryBodyChild) return true;

  return insertZoomBodyChild(editor, { select: false });
}

function focus(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (!targetEntry || !reveal(editor, targetNodeId)) return false;

  return navigate(editor, targetEntry[1]);
}

function zoomTo(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (
    !targetEntry ||
    isTanaFieldNodePresentationHidden(editor.children, targetEntry[1])
  ) {
    return false;
  }

  editor.setOption(TanaZoomPlugin, 'focusedNodeId', targetNodeId);
  if (hasTanaNodeDescendants(editor.children, targetEntry[1])) {
    editor.getApi(TogglePlugin).toggle.toggleIds([targetNodeId], true);
  }
  reveal(editor, targetNodeId);
  pruneBlockSelection(editor);

  return true;
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
      ensureBodyChild: () => ensureZoomBodyChild(editor),
      insertBodyChild: () => insertZoomBodyChild(editor),
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
