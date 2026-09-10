import { BlockSelectionPlugin } from '@platejs/selection/react';
import { canMutateTanaNode } from '../mutation-policy';
import {
  canDrag,
  canDuplicate,
  canIndent,
  canOutdent,
  canOwnTanaCanonicalChildren,
  canUseSlashCommand,
} from '@/lib/tana/node-behavior';
import { ElementApi, KEYS, NodeApi, RangeApi, TextApi, nanoid } from 'platejs';
import type { Path, TElement, TText } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { getTanaNodeDescendantPaths, getTanaAncestorPaths, getTanaParentPath } from '@/lib/tana/outliner';
import { containsTanaSoftLineBreak, splitTanaNodeLines } from '@/lib/tana/single-line';
import type { TanaBlockElement, TanaDoneState } from '@/lib/tana/types';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';
import { TanaSupertagPlugin } from './tana-supertag-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';

export const TANA_NODE_IDENTITY_PLUGIN_KEY = 'tanaNodeIdentity' as const;

const TANA_SEMANTIC_KEYS = [
  'tanaFieldDefinition',
  'tanaFieldId',
  'tanaFieldInitializer',
  'tanaFieldOptional',
  'tanaFieldPinned',
  'tanaFieldValueType',
  'tanaDoneState',
  'tanaDefaultChildSupertagId',
  'tanaPresentation',
  'tanaReferenceTargetId',
  'tanaSearchDefinition',
  'tanaSupertagIds',
  'tanaSupertagDefinition',
  'tanaSystemNode',
  'tanaTime',
  'tanaViewDefinition'
] as const;

/** Preserve rich leaves and inline formatting while promoting soft breaks. */
function splitRichNodeLines(node: TElement | TText): (TElement | TText)[] {
  if (TextApi.isText(node)) {
    return splitTanaNodeLines(node.text).map(text => ({ ...node, text }));
  }
  const groups: (TElement | TText)[][] = [[]];
  for (const child of node.children) {
    splitRichNodeLines(child).forEach((part, index) => {
      if (index > 0) groups.push([]);
      groups.at(-1)!.push(part);
    });
  }
  return groups.map(children => ({ ...node, children }) as TElement);
}

function getTanaNodeAtSingleNodeSelection(editor: PlateEditor) {
  const selection = editor.selection;

  if (
    !selection ||
    selection.anchor.path[0] !== selection.focus.path[0]
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

  return !!selection && editor.api.isStart(RangeApi.start(selection), path);
}

/** A cross-node Enter may only delete ordinary, currently interactable content. */
function canSplitAcrossTanaNodes(editor: PlateEditor): boolean {
  const selection = editor.selection;

  if (!selection || !RangeApi.isExpanded(selection)) return false;

  const [start, end] = RangeApi.edges(selection);

  for (let index = start.path[0]; index <= end.path[0]; index += 1) {
    const entry = editor.api.node<TElement>([index]);

    if (
      !entry ||
      !isTanaNodeElement(entry) ||
      entry[0].id === editor.getOption(TanaZoomPlugin, 'focusedNodeId') ||
      !canMutateTanaNode(editor, entry[1], canUseSlashCommand)
    ) {
      return false;
    }
  }

  return true;
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

function getCurrentBlockPath(editor: PlateEditor): Path | undefined {
  const entry = editor.api.block();

  return entry && isTanaNodeElement(entry) ? entry[1] : undefined;
}

type TanaPageRoot = {
  indent: number;
  path: Path;
};

function getTanaPageRoot(editor: PlateEditor): TanaPageRoot | undefined {
  const focusedNodeId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
  if (typeof focusedNodeId === 'string') {
    const focusedEntry = editor.api.node({ at: [], id: focusedNodeId });

    if (
      !focusedEntry ||
      !ElementApi.isElement(focusedEntry[0]) ||
      !isTanaNodeElement(focusedEntry)
    ) {
      return;
    }

    return {
      indent: typeof focusedEntry[0].indent === 'number' ? focusedEntry[0].indent : 0,
      path: focusedEntry[1],
    };
  }

  const workspaceIndex = editor.children.findIndex(
    (node) =>
      ElementApi.isElement(node) &&
      (node as TanaBlockElement).tanaSystemNode === 'workspace'
  );
  const workspace = workspaceIndex >= 0 ? editor.children[workspaceIndex] : undefined;

  if (!workspace || !ElementApi.isElement(workspace)) return;

  return {
    indent: typeof workspace.indent === 'number' ? workspace.indent : 0,
    path: [workspaceIndex],
  };
}

/** Only disjoint selected roots participate; descendants shift exactly once. */
export function getTanaSelectedRootPaths(editor: PlateEditor): Path[] {
  const selected = editor.plugins[BlockSelectionPlugin.key]
    ? editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({ sort: true })
    : [];
  const paths = (selected.length ? selected : editor.api.blocks())
    .filter(([node, path]) => isTanaNodeElement(node, path))
    .map(([, path]) => path);
  const indexes = new Set(paths.map(path => path[0]));
  return paths.filter(path => !getTanaAncestorPaths(editor.children, path)
    .some(ancestor => indexes.has(ancestor[0])));
}

/** Shift the existing canonical subtree, without visiting Reference targets. */
export function shiftTanaSubtreeIndent(editor: PlateEditor, rootPath: Path, delta: number) {
  const paths = [rootPath, ...getTanaNodeDescendantPaths(editor.children, rootPath)];
  for (const path of paths) {
    const node = editor.api.node<TElement>(path)![0];
    editor.tf.setNodes({ indent: (typeof node.indent === 'number' ? node.indent : 0) + delta }, { at: path });
  }
}

/**
 * Flat-indent moves determine ownership from the closest preceding shallower
 * Node after the selected ranges are removed. Reference edges are never part
 * of this scan: it considers only physical Plate hierarchy.
 */
function wouldCreateReferenceParent(
  editor: PlateEditor,
  removedPaths: readonly Path[],
  insertAt: number,
  targetIndent: number
): boolean {
  if (targetIndent <= 0) return false;

  const removedIndexes = new Set(removedPaths.map((path) => path[0]));
  const remaining = editor.children.filter((_, index) => !removedIndexes.has(index));

  for (let index = Math.min(insertAt, remaining.length) - 1; index >= 0; index -= 1) {
    const candidate = remaining[index];

    if (!ElementApi.isElement(candidate) || !isTanaNodeElement(candidate, [index])) continue;
    const candidateIndent = typeof candidate.indent === 'number' ? candidate.indent : 0;

    if (candidateIndent < targetIndent) {
      return !canOwnTanaCanonicalChildren(candidate);
    }
  }

  return false;
}

function getTanaDndRootPaths(editor: PlateEditor, draggedIds: readonly string[]): Path[] {
  const selected = draggedIds.flatMap((id) => {
    const entry = editor.api.node<TElement>({ at: [], id });

    return entry && isTanaNodeElement(entry) ? [entry[1]] : [];
  });

  if (selected.length !== new Set(draggedIds).size) return [];

  const selectedIndexes = new Set(selected.map((path) => path[0]));

  return selected
    .sort((left, right) => left[0] - right[0])
    .filter((path) => !getTanaAncestorPaths(editor.children, path)
      .some((ancestor) => selectedIndexes.has(ancestor[0])));
}

/**
 * The DnD adapter moves complete, disjoint canonical subtrees and rebases
 * their indents in the same history entry. It intentionally never follows
 * Reference edges: only flat Plate descendants participate.
 */
export function moveTanaDndSubtrees(
  editor: PlateEditor,
  draggedIds: readonly string[],
  to: Path,
  targetIndent: number
) {
  if (to.length !== 1 || !Number.isInteger(targetIndent)) return false;

  const roots = getTanaDndRootPaths(editor, draggedIds);

  if (
    roots.length === 0 ||
    roots.some((path) => !canMutateTanaNode(editor, path, canDrag))
  ) {
    return false;
  }

  const ranges = roots.map((root) => [root, ...getTanaNodeDescendantPaths(editor.children, root)]);
  const paths = ranges.flat();
  const sourceStart = paths[0]![0];
  const sourceEnd = paths.at(-1)![0];

  // Dropping inside the selected ranges is never a meaningful reparenting.
  if (to[0] >= sourceStart && to[0] <= sourceEnd + 1) return false;

  const nodes = paths.map((path) => editor.api.node<TElement>(path)?.[0]);

  if (nodes.some((node) => !node)) return false;

  const rootStates = roots.map((path) => {
    const node = editor.api.node<TElement>(path)![0];
    return { id: node.id as string, indent: typeof node.indent === 'number' ? node.indent : 0 };
  });
  const insertAt = to[0] - paths.filter((path) => path[0] < to[0]).length;

  if (wouldCreateReferenceParent(editor, paths, insertAt, targetIndent)) return false;

  let relocated = false;

  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    relocated = editor.getTransforms(TanaNodeLifecyclePlugin).node
      .relocateSubtreesRaw(nodes as TElement[], paths, [insertAt]);

    if (!relocated) return;

    rootStates.forEach(({ id, indent }) => {
      const moved = editor.api.node<TElement>({ at: [], id });
      if (moved) shiftTanaSubtreeIndent(editor, moved[1], targetIndent - indent);
    });
  }));

  return relocated;
}

function applyTanaDoneState(
  editor: PlateEditor,
  path: Path,
  state: TanaDoneState | undefined
) {
  const node = editor.api.node<TElement>(path)?.[0];
  const supportsTodoListAdapter = typeof node?.indent === 'number';

  editor.tf.withoutNormalizing(() => {
    if (state === undefined) {
      editor.tf.unsetNodes('tanaDoneState', { at: path });
      editor.tf.unsetNodes('checked', { at: path });
      editor.tf.unsetNodes('listStyleType', { at: path });
      return;
    }

    if (!supportsTodoListAdapter) {
      editor.tf.setNodes({ tanaDoneState: state }, { at: path });
      editor.tf.unsetNodes('checked', { at: path });
      editor.tf.unsetNodes('listStyleType', { at: path });
      return;
    }

    editor.tf.setNodes({ tanaDoneState: state, checked: state === 'done', listStyleType: 'todo' }, { at: path });
  });
}

/** The only writable Done transform. Plate checkbox fields are its adapter. */
export function setTanaDoneState(
  editor: PlateEditor,
  nodeId: string,
  state: TanaDoneState | undefined
) {
  const entry = editor.api.node<TanaBlockElement>({ at: [], id: nodeId });

  if (!entry || !canMutateTanaNode(editor, entry[1], canIndent)) return false;

  editor.tf.withNewBatch(() => applyTanaDoneState(editor, entry[1], state));
  return true;
}

export function toggleTanaDone(editor: PlateEditor, nodeId: string) {
  const entry = editor.api.node<TanaBlockElement>({ at: [], id: nodeId });

  if (!entry) return false;

  const next = entry[0].tanaDoneState === undefined
    ? 'todo'
    : entry[0].tanaDoneState === 'todo'
      ? 'done'
      : undefined;

  return setTanaDoneState(editor, nodeId, next);
}

function remapSubtreeRelation(value: unknown, ids: ReadonlyMap<string, string>, remap = false): unknown {
  if (typeof value === 'string') return remap ? ids.get(value) ?? value : value;
  if (Array.isArray(value)) return value.map((item) => remapSubtreeRelation(item, ids, remap));
  if (!value || typeof value !== 'object') return value;
  const relationKeys = new Set([
    'tanaReferenceTargetId', 'tanaFieldId', 'tanaDefaultChildSupertagId',
    'nodeId', 'fieldId', 'supertagId', 'tanaSupertagIds', 'hiddenFieldNodeIds',
    'extends', 'visibleFieldIds',
  ]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key, remapSubtreeRelation(item, ids, relationKeys.has(key)),
  ]));
}

/** Duplicate one or more disjoint canonical subtrees with fresh NodeIds. */
export function duplicateTanaSubtree(editor: PlateEditor, roots = getTanaSelectedRootPaths(editor)): string[] {
  if (roots.length === 0 || roots.some((path) => !canMutateTanaNode(editor, path, canDuplicate))) return [];
  const copied: TElement[] = [];
  const copiedIds: string[] = [];
  const idMap = new Map<string, string>();
  const sourcePaths = roots.flatMap((root) => [root, ...getTanaNodeDescendantPaths(editor.children, root)]);
  for (const path of sourcePaths) {
    const source = editor.api.node<TElement>(path)?.[0];
    if (!source || typeof source.id !== 'string') return [];
    const nextId = nanoid();
    idMap.set(source.id, nextId);
  }
  for (const path of sourcePaths) {
    const source = editor.api.node<TElement>(path)?.[0];
    if (!source || typeof source.id !== 'string') return [];
    const clone = structuredClone(source) as TElement;
    clone.id = idMap.get(source.id)!;
    const remapped = remapSubtreeRelation(clone, idMap) as TElement;
    remapped.id = clone.id;
    copied.push(remapped);
    copiedIds.push(remapped.id as string);
  }
  const end = Math.max(...roots.map((root) => (getTanaNodeDescendantPaths(editor.children, root).at(-1) ?? root)[0]));
  editor.tf.withNewBatch(() => editor.tf.insertNodes(copied, { at: [end + 1] }));
  return copiedIds;
}

export function indentTanaSelection(editor: PlateEditor, delta: number): boolean {
  if (delta !== 1 && delta !== -1) return false;
  const roots = getTanaSelectedRootPaths(editor);
  const page = getTanaPageRoot(editor);
  if (!page || roots.length === 0) return false;
  const policy = delta < 0 ? canOutdent : canIndent;
  const pageChildren = new Set(getTanaNodeDescendantPaths(editor.children, page.path).map(path => path[0]));
  if (roots.some(path => {
    const node = editor.api.node<TElement>(path)?.[0];
    if (!node || !pageChildren.has(path[0]) || !canMutateTanaNode(editor, path, policy)) return true;
    const indent = typeof node.indent === 'number' ? node.indent : 0;
    if (delta < 0) return indent <= page.indent + 1;
    // Indentation needs a preceding sibling to become the new parent.
    const parent = getTanaParentPath(editor.children, path);
    for (let index = path[0] - 1; index > (parent?.[0] ?? -1); index--) {
      const previous = editor.api.node<TElement>([index])?.[0];
      if (previous?.indent === indent) {
        return (
          !canMutateTanaNode(editor, [index], canIndent) ||
          !canOwnTanaCanonicalChildren(previous)
        );
      }
    }
    return true;
  })) return false;
  const rootIds = roots.map(path => editor.children[path[0]].id as string);
  const selection = editor.selection;
  const anchorId = selection && editor.children[selection.anchor.path[0]].id;
  const focusId = selection && editor.children[selection.focus.path[0]].id;
  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    // Outdent from right to left so selected siblings retain their order.
    for (const id of delta < 0 ? rootIds.toReversed() : rootIds) {
      let path = editor.api.node({ at: [], id })![1];
      if (delta < 0) {
        const parent = getTanaParentPath(editor.children, path)!;
        const parentEnd = getTanaNodeDescendantPaths(editor.children, parent).at(-1)!;
        const descendants = getTanaNodeDescendantPaths(editor.children, path);
        const end = descendants.at(-1) ?? path;
        if (end[0] < parentEnd[0]) {
          editor.tf.moveNodes({ at: path, to: [parentEnd[0] + (descendants.length ? 1 : 0)] });
          path = editor.api.node({ at: [], id })![1];
        }
      }
      shiftTanaSubtreeIndent(editor, path, delta);
    }
    if (selection) {
      const anchor = editor.children.findIndex(node => node.id === anchorId);
      const focus = editor.children.findIndex(node => node.id === focusId);
      if (anchor >= 0 && focus >= 0) editor.tf.select({
        anchor: { ...selection.anchor, path: [anchor, ...selection.anchor.path.slice(1)] },
        focus: { ...selection.focus, path: [focus, ...selection.focus.path.slice(1)] },
      });
    }
  }));
  return true;
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

function moveTanaSubtree(
  editor: PlateEditor,
  moveNodes: PlateEditor['tf']['moveNodes'],
  removeNodes: PlateEditor['tf']['removeNodes'],
  options: { at?: unknown; to?: unknown }
): boolean | void {
  if (
    !Array.isArray(options.at) ||
    options.at.length !== 1 ||
    !Array.isArray(options.to) ||
    options.to.length !== 1
  ) {
    return;
  }

  const sourcePath: Path = options.at;
  const source = editor.api.node(sourcePath);

  if (!source || !ElementApi.isElement(source[0]) || !isTanaNodeElement(source[0], sourcePath)) {
    return;
  }

  const subtreePaths = [sourcePath, ...getTanaNodeDescendantPaths(editor.children, sourcePath)];
  const sourceStart = sourcePath[0];
  const sourceEnd = subtreePaths.at(-1)![0];
  const destination = options.to[0];
  const sourceIndent = typeof source[0].indent === 'number' ? source[0].indent : 0;
  const insertAt = destination > sourceEnd
    ? destination - subtreePaths.length
    : destination;

  if (wouldCreateReferenceParent(editor, subtreePaths, insertAt, sourceIndent)) {
    return false;
  }

  // Let Plate retain its leaf move lifecycle after the ownership check above.
  if (subtreePaths.length === 1) return;

  // Moving a subtree onto itself or directly before/after it is a no-op.
  if (destination >= sourceStart && destination <= sourceEnd + 1) return false;

  const nodes = subtreePaths.map((path) => editor.api.node(path)?.[0]).filter(
    (node): node is TElement => ElementApi.isElement(node)
  );

  if (nodes.length !== subtreePaths.length) return moveNodes(options as never);

  editor.tf.withoutNormalizing(() => {
    subtreePaths
      .slice()
      .reverse()
      .forEach((path) => removeNodes({ at: path }));
    editor.tf.insertNodes(nodes, { at: [insertAt] });
  });

  return true;
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

/** Move one canonical subtree across exactly one adjacent sibling subtree. */
export function moveTanaSibling(editor: PlateEditor, nodeId: string, direction: -1 | 1) {
  const entry = editor.api.node<TanaBlockElement>({ at: [], id: nodeId });
  if (!entry || !canMutateTanaNode(editor, entry[1], canIndent)) return false;
  const [node, path] = entry;
  if (editor.getOption(TanaZoomPlugin, 'focusedNodeId') === nodeId) return false;
  const parent = getTanaParentPath(editor.children, path);
  if (!parent) return false;
  const siblings = getTanaNodeDescendantPaths(editor.children, parent).filter(candidate =>
    getTanaParentPath(editor.children, candidate)?.[0] === parent[0]);
  const neighbor = siblings[siblings.findIndex(candidate => candidate[0] === path[0]) + direction];
  if (!neighbor || !canMutateTanaNode(editor, neighbor, canIndent)) return false;
  const neighborEnd = getTanaNodeDescendantPaths(editor.children, neighbor).at(-1) ?? neighbor;
  const selection = editor.selection;
  const anchorNode = selection && editor.children[selection.anchor.path[0]];
  const focusNode = selection && editor.children[selection.focus.path[0]];
  editor.tf.withNewBatch(() => {
    const carriesChildren = getTanaNodeDescendantPaths(editor.children, path).length > 0;
    editor.tf.moveNodes({ at: path, to: direction < 0 ? neighbor : [neighborEnd[0] + (carriesChildren ? 1 : 0)] });
    // Range moves preserve canonical IDs; reattach Plate's caret after its
    // remove/insert operations rather than keeping a second selection model.
    if (selection && anchorNode && focusNode) {
      const anchorIndex = editor.children.findIndex(candidate => candidate.id === anchorNode.id);
      const focusIndex = editor.children.findIndex(candidate => candidate.id === focusNode.id);
      if (anchorIndex >= 0 && focusIndex >= 0) editor.tf.select({
        anchor: { ...selection.anchor, path: [anchorIndex, ...selection.anchor.path.slice(1)] },
        focus: { ...selection.focus, path: [focusIndex, ...selection.focus.path.slice(1)] },
      });
    }
  });
  return node.id === nodeId;
}

/** Insert an ordinary sibling without entering the current canonical subtree. */
export function insertTanaSibling(editor: PlateEditor, nodeId: string, before = false) {
  const entry = editor.api.node<TanaBlockElement>({ at: [], id: nodeId });
  if (!entry || !isTanaNodeElement(entry) || !canMutateTanaNode(editor, entry[1], canIndent)) return false;
  if (editor.getOption(TanaZoomPlugin, 'focusedNodeId') === nodeId) return false;
  const [node, path] = entry;
  const end = getTanaNodeDescendantPaths(editor.children, path).at(-1) ?? path;
  editor.tf.withNewBatch(() => editor.tf.insertNodes({
    type: KEYS.p, id: nanoid(), indent: node.indent ?? 0,
    children: [{ text: '' }],
  }, { at: before ? path : [end[0] + 1], select: true }));
  return true;
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
    apply,
    normalizeNode,
    insertFragment,
    insertNodes,
    deleteBackward,
    deleteForward,
    insertBreak,
    insertText,
    insertTextData,
    mergeNodes,
    moveNodes,
    removeNodes,
    tab,
  },
}) => {
  const splitTanaNode = (entry: [TanaBlockElement, Path]) => {
    const [node, path] = entry;

    // Workspace is the unique root. It is a container boundary, not an
    // editable block that can split into another indent-0 Node.
    if (node.tanaSystemNode === 'workspace') return false;

    if (editor.getOption(TanaZoomPlugin, 'focusedNodeId') === node.id) return false;

    const previousId = node.id;
    const selectionAtStart = isSelectionAtStart(editor, path);
    const subtreeEnd = getTanaNodeDescendantPaths(editor.children, path).at(-1);

    editor.tf.withoutNormalizing(() => {
      insertBreak();
      const rightPath = [path[0] + 1];
      const rightEntry = editor.api.node(rightPath);
      if (!rightEntry || !ElementApi.isElement(rightEntry[0])) return;
      if (selectionAtStart) {
        const rightId = typeof rightEntry[0].id === 'string' ? rightEntry[0].id : nanoid();
        editor.tf.setNodes({ id: rightId }, { at: path });
        TANA_SEMANTIC_KEYS.forEach(key => editor.tf.unsetNodes(key, { at: path }));
        applyTanaDoneState(editor, path, undefined);
        editor.tf.setNodes({ id: previousId }, { at: rightPath });
        editor.getTransforms(TanaSupertagPlugin).supertag.applyDefaultChild(rightId);
        return;
      }
      const newNodeId = nanoid();
      editor.tf.setNodes({ id: newNodeId }, { at: rightPath });
      TANA_SEMANTIC_KEYS.forEach(key => editor.tf.unsetNodes(key, { at: rightPath }));
      if (node.tanaDoneState !== undefined) {
        applyTanaDoneState(editor, rightPath, node.tanaDoneState);
      } else {
        editor.tf.unsetNodes('checked', { at: rightPath });
        editor.tf.unsetNodes('listStyleType', { at: rightPath });
      }
      // The left identity still owns its original children. Move only the
      // newly split block using Plate's primitive, before hierarchy is read.
      if (subtreeEnd) moveNodes({ at: rightPath, to: [subtreeEnd[0] + 1] });
      editor.getTransforms(TanaSupertagPlugin).supertag.applyDefaultChild(newNodeId);
    });
    return true;
  };

  return ({
  transforms: {
    apply(operation) {
      // Low-level writers must not bypass the semantic editing invariant.
      if ((operation.type === 'insert_text' && containsTanaSoftLineBreak(operation.text)) ||
          (operation.type === 'insert_node' && containsTanaSoftLineBreak(NodeApi.string(operation.node)))) {
        throw new Error('Tana Nodes cannot contain soft line breaks');
      }
      return apply(operation);
    },
    normalizeNode(entry) {
      const [node, path] = entry;
      if (ElementApi.isElement(node) && isTanaNodeElement(node, path) && containsTanaSoftLineBreak(NodeApi.string(node))) {
        throw new Error('Tana Nodes cannot contain soft line breaks');
      }
      if (ElementApi.isElement(node) && isTanaNodeElement(node, path)) {
        const doneState = (node as TanaBlockElement).tanaDoneState;
        const hasTodoAdapter = node.listStyleType === 'todo';
        const hasCheckedAdapter = node.checked !== undefined;

        // Task-list autoformat reaches Plate first. Normalize it immediately
        // into the canonical Tana state; all later rendering is derived back.
        if (doneState === undefined && hasTodoAdapter) {
          if (typeof node.indent !== 'number') {
            editor.tf.withoutNormalizing(() => {
              editor.tf.unsetNodes('checked', { at: path });
              editor.tf.unsetNodes('listStyleType', { at: path });
            });
            return;
          }
          applyTanaDoneState(editor, path, node.checked === true ? 'done' : 'todo');
          return;
        }
        if (doneState === undefined && hasCheckedAdapter) {
          editor.tf.unsetNodes('checked', { at: path });
          return;
        }
        if (doneState !== undefined && typeof node.indent === 'number' &&
          (node.listStyleType !== 'todo' || node.checked !== (doneState === 'done'))) {
          applyTanaDoneState(editor, path, doneState);
          return;
        }
        if (doneState !== undefined && typeof node.indent !== 'number' &&
          (hasTodoAdapter || hasCheckedAdapter)) {
          editor.tf.withoutNormalizing(() => {
            editor.tf.unsetNodes('checked', { at: path });
            editor.tf.unsetNodes('listStyleType', { at: path });
          });
          return;
        }
      }
      return normalizeNode(entry);
    },
    insertNodes(nodes, options) {
      const incoming = Array.isArray(nodes) ? nodes : [nodes];
      if (incoming.some(node => containsTanaSoftLineBreak(NodeApi.string(node)))) {
        throw new Error('Tana Nodes cannot contain soft line breaks');
      }
      return insertNodes(nodes, options);
    },
    insertFragment(fragment, options) {
      const lines = fragment.flatMap(node => splitRichNodeLines(node).map((part, index) => {
        if (index && ElementApi.isElement(part)) {
          const ordinary: TElement = { ...part, id: nanoid(), type: KEYS.p };
          TANA_SEMANTIC_KEYS.forEach(key => delete ordinary[key]);
          return ordinary;
        }
        return part;
      }));
      editor.tf.withNewBatch(() => insertFragment(lines, options));
    },
    deleteBackward(unit) {
      if (hasSystemMergeBoundary(editor, 'start')) return;

      return deleteBackward(unit);
    },
    deleteForward(unit) {
      if (hasSystemMergeBoundary(editor, 'end')) return;

      return deleteForward(unit);
    },
    insertSoftBreak() {
      const entry = getTanaNodeAtSingleNodeSelection(editor);
      if (entry) insertTanaSibling(editor, entry[0].id as string);
    },
    insertText(text, options) {
      if (!containsTanaSoftLineBreak(text)) return insertText(text, options);
      if (options?.at) editor.tf.select(options.at);
      const blocks = editor.api.blocks();
      if (blocks.some(([node, path]) =>
        !canMutateTanaNode(editor, path, canIndent) ||
        node.id === editor.getOption(TanaZoomPlugin, 'focusedNodeId'))) return;
      // Newlines are document boundaries, including plain-text paste. Plate
      // retains selection, marks, splitting and history ownership.
      editor.tf.withNewBatch(() => {
        const lines = splitTanaNodeLines(text);
        lines.forEach((line, index) => {
          if (index) editor.tf.insertBreak();
          insertText(line);
        });
      });
    },
    insertTextData(data) {
      const text = data.getData('text/plain');
      if (!containsTanaSoftLineBreak(text)) return insertTextData(data);
      editor.tf.insertText(text);
      return true;
    },
    insertBreak() {
      const entry = getTanaNodeAtSingleNodeSelection(editor);

      if (!entry || typeof entry[0].id !== 'string') {
        if (!canSplitAcrossTanaNodes(editor)) return;
        return editor.tf.withNewBatch(() => {
          editor.tf.deleteFragment();
          const collapsedEntry = getTanaNodeAtSingleNodeSelection(editor);
          if (collapsedEntry) splitTanaNode(collapsedEntry);
        });
      }

      const batch = editor.api.isMerging() ? editor.tf.withMerging : editor.tf.withNewBatch;
      return batch(() => splitTanaNode(entry));
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

      const movedSubtree = moveTanaSubtree(editor, moveNodes, removeNodes, options);

      if (movedSubtree !== undefined) return movedSubtree;

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
      if (!getTanaSelectedRootPaths(editor).length) return tab(options);
      indentTanaSelection(editor, options?.reverse ? -1 : 1);
      return true;
    },
  },
  });
}).extendEditorTransforms(({ editor }) => ({
  tanaNodeIdentity: {
    moveSibling: (nodeId: string, direction: -1 | 1) => moveTanaSibling(editor, nodeId, direction),
    insertBefore: (nodeId: string) => insertTanaSibling(editor, nodeId, true),
    insertAfter: (nodeId: string) => insertTanaSibling(editor, nodeId),
    setDoneState: (nodeId: string, state: TanaDoneState | undefined) =>
      setTanaDoneState(editor, nodeId, state),
    toggleDone: (nodeId: string) => toggleTanaDone(editor, nodeId),
    splitNode: (nodeId: string, selection: NonNullable<PlateEditor['selection']>) => {
      const entry = editor.api.node<TanaBlockElement>({ at: [], id: nodeId });
      if (!entry || selection.anchor.path[0] !== entry[1][0] || selection.focus.path[0] !== entry[1][0]) return false;
      if (!canMutateTanaNode(editor, entry[1], canIndent)) return false;
      editor.tf.withNewBatch(() => {
        editor.tf.select(selection);
        editor.tf.insertBreak();
      });
      return true;
    },
  },
}));
