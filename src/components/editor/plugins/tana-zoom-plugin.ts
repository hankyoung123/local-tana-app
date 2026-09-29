import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { ElementApi } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { buildTanaIndex, getTanaProjectionTarget } from '@/lib/tana/index';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import {
  getTanaAncestorPaths,
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  hasTanaNodeDescendants,
  isTanaFieldNodePresentationHidden,
  isTanaNodeInteractable,
} from '@/lib/tana/outliner';
import { getNodeSemanticType } from '@/lib/tana/node-semantic';
import type { NodeId } from '@/lib/tana/types';

import { TanaSupertagPlugin } from './tana-supertag-plugin';

const EMPTY_OPEN_IDS = new Set<string>();

export const TANA_ZOOM_PLUGIN_KEY = 'tanaZoom' as const;

export type TanaZoomHistoryEntry = NodeId | null;

type TanaZoomBrowserState = {
  tanaHistory: TanaZoomHistoryEntry[];
  tanaHistoryIndex: number;
};

export const TANA_EDITOR_PATH = '/editor';

export function getTanaEditorHref(nodeId: NodeId | null = null) {
  const url = new URL(TANA_EDITOR_PATH, 'http://tana.local');

  if (nodeId) url.searchParams.set('node', nodeId);

  return `${url.pathname}${url.search}`;
}

export function getTanaEditorNodeId(locationLike: Pick<Location, 'pathname' | 'search'>) {
  if (locationLike.pathname !== TANA_EDITOR_PATH) return null;

  const nodeId = new URLSearchParams(locationLike.search).get('node');

  return nodeId || null;
}

function readBrowserState(value: unknown, nodeId: NodeId | null): TanaZoomBrowserState | null {
  if (!value || typeof value !== 'object') return null;

  const state = value as Partial<TanaZoomBrowserState>;
  const history = state.tanaHistory;
  const historyIndex = state.tanaHistoryIndex;

  if (
    !Array.isArray(history) ||
    history.length === 0 ||
    !history.every((entry) => entry === null || typeof entry === 'string') ||
    !Number.isInteger(historyIndex) ||
    historyIndex! < 0 ||
    historyIndex! >= history.length ||
    history[historyIndex!] !== nodeId
  ) return null;

  return { tanaHistory: history, tanaHistoryIndex: historyIndex! };
}

function syncBrowserUrl(
  nodeId: NodeId | null,
  mode: 'push' | 'replace',
  history: readonly TanaZoomHistoryEntry[],
  historyIndex: number
) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.pathname = TANA_EDITOR_PATH;
  if (nodeId) url.searchParams.set('node', nodeId);
  else url.searchParams.delete('node');

  const currentState = window.history.state;
  const routerState = currentState && typeof currentState === 'object' ? currentState : {};

  window.history[`${mode}State`]({
    ...routerState,
    tanaNodeId: nodeId,
    tanaHistory: [...history],
    tanaHistoryIndex: historyIndex,
  }, '', url);
}

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

function getHistory(editor: PlateEditor): TanaZoomHistoryEntry[] {
  return editor.getOption(TanaZoomPlugin, 'history') ?? [null];
}

function getHistoryIndex(editor: PlateEditor): number {
  return editor.getOption(TanaZoomPlugin, 'historyIndex') ?? 0;
}

function setNavigationState(
  editor: PlateEditor,
  focusedNodeId: NodeId | null,
  history: readonly TanaZoomHistoryEntry[],
  historyIndex: number,
  urlMode: 'push' | 'replace' | 'none'
) {
  editor.setOption(TanaZoomPlugin, 'focusedNodeId', focusedNodeId);
  editor.setOption(TanaZoomPlugin, 'history', [...history]);
  editor.setOption(TanaZoomPlugin, 'historyIndex', historyIndex);
  if (urlMode !== 'none') syncBrowserUrl(focusedNodeId, urlMode, history, historyIndex);
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
  const directChildPaths = getTanaDirectChildPaths(editor.children, hostPath);
  const trailingChild = directChildPaths.at(-1);

  if (trailingChild && isEmptyZoomBodyChild(editor, trailingChild)) {
    editor.getApi(TogglePlugin).toggle.toggleIds([focusedNodeId], true);
    return select ? navigate(editor, trailingChild) : true;
  }

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

export function isEmptyZoomBodyChild(editor: PlateEditor, path: number[]) {
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

  return hasOrdinaryBodyChild;
}

function focus(editor: PlateEditor, targetNodeId: NodeId) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (!targetEntry || !reveal(editor, targetNodeId)) return false;

  return navigate(editor, targetEntry[1]);
}

function zoomTo(
  editor: PlateEditor,
  targetNodeId: NodeId,
  options?: {
    historyIndex?: number;
    record?: boolean;
    urlMode?: 'push' | 'replace' | 'none';
  }
) {
  const targetEntry = getTanaNodeEntry(editor, targetNodeId);

  if (
    !targetEntry ||
    isTanaFieldNodePresentationHidden(editor.children, targetEntry[1])
  ) {
    return false;
  }

  const record = options?.record ?? true;
  const current = getFocusedNodeId(editor);
  const urlMode = options?.urlMode ?? (record && current !== targetNodeId ? 'push' : 'replace');
  const history = getHistory(editor);
  const historyIndex = getHistoryIndex(editor);
  let nextHistory = history;
  let nextHistoryIndex = historyIndex;

  if (record && current !== targetNodeId) {
    nextHistory = [...history.slice(0, historyIndex + 1), targetNodeId];
    nextHistoryIndex = nextHistory.length - 1;
  } else if (typeof options?.historyIndex === 'number') {
    nextHistoryIndex = Math.max(0, Math.min(options.historyIndex, history.length - 1));
  }

  setNavigationState(editor, targetNodeId, nextHistory, nextHistoryIndex, urlMode);
  if (hasTanaNodeDescendants(editor.children, targetEntry[1])) {
    editor.getApi(TogglePlugin).toggle.toggleIds([targetNodeId], true);
  }
  reveal(editor, targetNodeId);
  pruneBlockSelection(editor);

  return true;
}

function zoomRoot(editor: PlateEditor, options?: { record?: boolean; urlMode?: 'push' | 'replace' | 'none' }) {
  const record = options?.record ?? true;
  const current = getFocusedNodeId(editor);
  const urlMode = options?.urlMode ?? (record && current !== null ? 'push' : 'replace');
  const history = getHistory(editor);
  const historyIndex = getHistoryIndex(editor);
  let nextHistory = history;
  let nextHistoryIndex = historyIndex;

  if (record && current !== null) {
    nextHistory = [...history.slice(0, historyIndex + 1), null];
    nextHistoryIndex = nextHistory.length - 1;
  }

  setNavigationState(editor, null, nextHistory, nextHistoryIndex, urlMode);
  pruneBlockSelection(editor);

  return true;
}

function zoomOut(editor: PlateEditor) {
  return zoomPrevious(editor);
}

function zoomPrevious(editor: PlateEditor): boolean {
  const history = getHistory(editor);
  const historyIndex = getHistoryIndex(editor);

  if (historyIndex <= 0) return false;

  if (typeof window !== 'undefined') {
    const browserState = readBrowserState(window.history.state, getFocusedNodeId(editor));

    if (
      browserState?.tanaHistoryIndex === historyIndex &&
      browserState.tanaHistory.length === history.length &&
      browserState.tanaHistory.every((entry, index) => entry === history[index])
    ) {
      window.history.back();
      return true;
    }
  }

  const nextIndex = historyIndex - 1;
  const target = history[nextIndex] ?? null;

  if (target && !getTanaNodeEntry(editor, target)) {
    return zoomRootAtHistory(editor, nextIndex);
  }

  if (target === null) return zoomRootAtHistory(editor, nextIndex);

  return zoomTo(editor, target, { historyIndex: nextIndex, record: false, urlMode: 'replace' })
    ? true
    : zoomRootAtHistory(editor, nextIndex);
}

function zoomRootAtHistory(editor: PlateEditor, historyIndex: number): boolean {
  const history = getHistory(editor);
  setNavigationState(editor, null, history, historyIndex, 'replace');
  pruneBlockSelection(editor);
  return true;
}

function restore(
  editor: PlateEditor,
  targetNodeId: NodeId | null,
  browserState?: unknown
): boolean {
  const savedState = readBrowserState(browserState, targetNodeId);
  const history = savedState?.tanaHistory ?? [targetNodeId];
  const historyIndex = savedState?.tanaHistoryIndex ?? 0;
  const urlMode = savedState ? 'none' : 'replace';

  if (targetNodeId !== null && !reveal(editor, targetNodeId)) {
    setNavigationState(editor, null, [null], 0, 'replace');
    pruneBlockSelection(editor);
    return false;
  }

  setNavigationState(editor, targetNodeId, history, historyIndex, urlMode);
  if (targetNodeId !== null) {
    const targetEntry = getTanaNodeEntry(editor, targetNodeId);

    if (targetEntry && hasTanaNodeDescendants(editor.children, targetEntry[1])) {
      editor.getApi(TogglePlugin).toggle.toggleIds([targetNodeId], true);
    }
  }
  pruneBlockSelection(editor);
  return true;
}

function resetInvalid(editor: PlateEditor, options?: { includeTrash?: boolean }) {
  const focusedNodeId = getFocusedNodeId(editor);

  if (!focusedNodeId || (getTanaNodeEntry(editor, focusedNodeId) && !options?.includeTrash)) return false;
  if (focusedNodeId && getTanaNodeEntry(editor, focusedNodeId) && options?.includeTrash) {
    const index = buildTanaIndex(editor.children);
    const trashId = index.systemNodeIds.get('trash');
    const parentId = index.parentNodeIds.get(focusedNodeId);
    if (!trashId || parentId !== trashId) return false;
  }

  return zoomRoot(editor, { record: false, urlMode: 'replace' });
}

/** Plate owns the sole Zoom state and all Tana-specific navigation transforms. */
export const TanaZoomPlugin = createPlatePlugin<
  typeof TANA_ZOOM_PLUGIN_KEY,
  {
    focusedNodeId: NodeId | null;
    history: TanaZoomHistoryEntry[];
    historyIndex: number;
  }
>({
  key: TANA_ZOOM_PLUGIN_KEY,
  options: {
    focusedNodeId: null,
    history: [null],
    historyIndex: 0,
  },
  priority: 0,
})
  .extendEditorApi(({ editor }) => ({
    zoom: {
      focus: (nodeId: NodeId) => focus(editor, nodeId),
      pruneBlockSelection: () => pruneBlockSelection(editor),
      resetInvalid: (options?: { includeTrash?: boolean }) => resetInvalid(editor, options),
      reveal: (nodeId: NodeId) => reveal(editor, nodeId),
      restore: (nodeId: NodeId | null, browserState?: unknown) => restore(editor, nodeId, browserState),
    },
  }))
  .extendEditorTransforms(({ editor }) => ({
    zoom: {
      toResult: (nodeId: NodeId) => {
        const target = getTanaProjectionTarget(buildTanaIndex(editor.children), nodeId);
        return target ? zoomTo(editor, target.id) : false;
      },
      ensureBodyChild: () => ensureZoomBodyChild(editor),
      insertBodyChild: () => insertZoomBodyChild(editor),
      out: () => zoomOut(editor),
      previous: () => zoomPrevious(editor),
      root: () => zoomRoot(editor),
      to: (nodeId: NodeId) => zoomTo(editor, nodeId),
    },
  }));
