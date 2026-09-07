import { canMutateTanaNode } from '../mutation-policy';
import { canTrash } from '@/lib/tana/node-behavior';
import { ElementApi } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { getTanaNodeDescendantPaths, getTanaParentPath } from '@/lib/tana/outliner';
import { getNodeSemanticTypes } from '@/lib/tana/node-semantic';
import type { NodeId, TanaBlockElement, TanaSystemNode } from '@/lib/tana/types';

export const TANA_NODE_LIFECYCLE_PLUGIN_KEY = 'tanaNodeLifecycle' as const;

type TanaNodeEntry = [TanaBlockElement, Path];
type TanaRestoreDestination = 'daily-notes' | 'home';
type RawSubtreeInsertion = {
  at: Path;
  nodes: readonly TElement[];
};

function getIndent(node: TElement): number {
  return typeof node.indent === 'number' ? node.indent : 0;
}

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId): TanaNodeEntry | undefined {
  const entry = editor.api.node({ at: [], id: nodeId });

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as TanaNodeEntry)
    : undefined;
}

function getSystemNodeEntry(
  editor: PlateEditor,
  systemNode: TanaSystemNode
): TanaNodeEntry | undefined {
  const index = editor.children.findIndex(
    (node) =>
      ElementApi.isElement(node) &&
      (node as TanaBlockElement).tanaSystemNode === systemNode
  );
  const node = index >= 0 ? editor.children[index] : undefined;

  return node && ElementApi.isElement(node)
    ? [node as TanaBlockElement, [index]]
    : undefined;
}

function isWithinSubtree(editor: PlateEditor, path: Path, ancestorPath: Path): boolean {
  return getTanaNodeDescendantPaths(editor.children, ancestorPath).some(
    (descendantPath) => descendantPath[0] === path[0]
  );
}

function isDirectChildOf(editor: PlateEditor, path: Path, parentPath: Path): boolean {
  return getTanaParentPath(editor.children, path)?.[0] === parentPath[0];
}

function isFieldStructureNode(
  editor: PlateEditor,
  node: TanaBlockElement,
  path: Path
): boolean {
  const semantics = getNodeSemanticTypes(node, { document: editor.children, path });

  return semantics.includes('field') || semantics.includes('value');
}

function getSubtree(
  editor: PlateEditor,
  sourcePath: Path
): readonly [readonly Path[], readonly TElement[]] | undefined {
  const paths = [sourcePath, ...getTanaNodeDescendantPaths(editor.children, sourcePath)];
  const nodes = paths.map((path) => editor.api.node(path)?.[0]);

  if (nodes.some((node) => !node || !ElementApi.isElement(node))) return;
  if (nodes.some((node) => (node as TanaBlockElement).tanaSystemNode !== undefined)) {
    return;
  }

  return [paths, nodes as TElement[]];
}

function moveSubtreeToSystem(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  nodeId: NodeId,
  destinationSystemNode: TanaRestoreDestination | 'trash',
  requireDirectSourceParent: boolean
): boolean {
  const source = getTanaNodeEntry(editor, nodeId);
  const destination = getSystemNodeEntry(editor, destinationSystemNode);

  if (!source || !destination || source[0].tanaSystemNode !== undefined) return false;
  if (
    requireDirectSourceParent
      ? !isDirectChildOf(editor, source[1], destination[1])
      : isWithinSubtree(editor, source[1], destination[1])
  ) {
    return false;
  }

  const subtree = getSubtree(editor, source[1]);

  if (!subtree) return false;

  const [paths, nodes] = subtree;
  const sourceIndent = getIndent(nodes[0]);
  const relocatedNodes = nodes.map((node) => ({
    ...node,
    indent: getIndent(destination[0]) + 1 + getIndent(node) - sourceIndent,
  }));

  editor.tf.withoutNormalizing(() => {
    paths
      .slice()
      .reverse()
      .forEach((path) => removeNodes({ at: path }));

    const currentDestination = getSystemNodeEntry(editor, destinationSystemNode);

    if (!currentDestination) return;

    const descendants = getTanaNodeDescendantPaths(editor.children, currentDestination[1]);
    const insertionPath = [(descendants.at(-1) ?? currentDestination[1])[0] + 1] as Path;

    editor.tf.insertNodes(relocatedNodes, { at: insertionPath });
  });

  return true;
}

function trash(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  nodeId: NodeId
): boolean {
  const entry = getTanaNodeEntry(editor, nodeId);
  if (!entry || !canMutateTanaNode(editor, entry[1], canTrash)) return false;
  return moveSubtreeToSystem(editor, removeNodes, nodeId, 'trash', false);
}

function restore(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  nodeId: NodeId,
  destination: TanaRestoreDestination = 'home'
): boolean {
  const source = getTanaNodeEntry(editor, nodeId);
  const trashNode = getSystemNodeEntry(editor, 'trash');

  if (!source || !trashNode || !isDirectChildOf(editor, source[1], trashNode[1])) {
    return false;
  }

  return moveSubtreeToSystem(editor, removeNodes, nodeId, destination, false);
}

function deletePermanently(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  nodeId: NodeId
): boolean {
  const source = getTanaNodeEntry(editor, nodeId);
  const trashNode = getSystemNodeEntry(editor, 'trash');

  if (
    !source ||
    !trashNode ||
    source[0].tanaSystemNode !== undefined ||
    !isWithinSubtree(editor, source[1], trashNode[1])
  ) {
    return false;
  }

  const subtree = getSubtree(editor, source[1]);

  if (!subtree) return false;

  editor.tf.withoutNormalizing(() => {
    subtree[0]
      .slice()
      .reverse()
      .forEach((path) => removeNodes({ at: path }));
  });

  return true;
}

function removeSelectedOrdinaryNodes(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  options: { at?: unknown; block?: unknown; match?: unknown }
): boolean {
  if (
    !Array.isArray(options.at) ||
    options.at.length !== 0 ||
    options.block !== true ||
    typeof options.match !== 'function'
  ) {
    return false;
  }
  const match = options.match;

  const selected = editor.children.flatMap((node, index) => {
    const path: Path = [index];

    return (
      ElementApi.isElement(node) &&
      isTanaNodeElement(node, path) &&
      match(node, path)
    )
      ? [[node as TanaBlockElement, path] as TanaNodeEntry]
      : [];
  });

  if (selected.some(([node, path]) => isFieldStructureNode(editor, node, path))) {
    return false;
  }

  const selectedIndexes = new Set(selected.map(([, path]) => path[0]));
  const roots = selected.filter(([, path]) => {
    let parent = getTanaParentPath(editor.children, path);

    while (parent) {
      if (selectedIndexes.has(parent[0])) return false;
      parent = getTanaParentPath(editor.children, parent);
    }

    return true;
  });
  if (roots.some(([, path]) => !canMutateTanaNode(editor, path, canTrash))) return true;

  roots.forEach(([node]) => {
    if (node.tanaSystemNode !== undefined || typeof node.id !== 'string') return;

    const trashNode = getSystemNodeEntry(editor, 'trash');
    const entry = getTanaNodeEntry(editor, node.id);

    if (!entry || !trashNode) return;

    if (isWithinSubtree(editor, entry[1], trashNode[1])) {
      deletePermanently(editor, removeNodes, node.id);
    } else {
      trash(editor, removeNodes, node.id);
    }
  });

  return selected.length > 0;
}

/**
 * Relocate an already-resolved set of flat document paths with the raw
 * structural transforms captured below the lifecycle boundary. This is for
 * semantic moves, where removal is not deletion and therefore must never
 * enter Trash.
 */
function relocateSubtreesRaw(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  nodes: readonly TElement[],
  paths: readonly Path[],
  at: Path
): boolean {
  if (
    at.length !== 1 ||
    nodes.length === 0 ||
    nodes.length !== paths.length ||
    paths.some((path) => path.length !== 1)
  ) {
    return false;
  }

  editor.tf.withoutNormalizing(() => {
    paths.toReversed().forEach((path) => removeNodes({ at: path }));
    editor.tf.insertNodes(nodes.slice(), { at });
  });

  return true;
}

/**
 * Applies a precomputed structural replacement under the captured raw remove
 * transform. Semantic relocations use this instead of `editor.tf.removeNodes`
 * so they can never enter the Trash lifecycle.
 */
function replaceSubtreesRaw(
  editor: PlateEditor,
  removeNodes: PlateEditor['tf']['removeNodes'],
  paths: readonly Path[],
  insertions: readonly RawSubtreeInsertion[]
): boolean {
  if (
    paths.length === 0 ||
    new Set(paths.map((path) => path.join('.'))).size !== paths.length ||
    paths.some((path) => path.length !== 1) ||
    insertions.some(
      ({ at, nodes }) =>
        at.length !== 1 ||
        !Number.isInteger(at[0]) ||
        at[0] < 0 ||
        nodes.length === 0
    )
  ) {
    return false;
  }

  editor.tf.withoutNormalizing(() => {
    paths
      .toSorted((left, right) => right[0] - left[0])
      .forEach((path) => removeNodes({ at: path }));
    insertions.forEach(({ at, nodes }) => editor.tf.insertNodes(nodes.slice(), { at }));
  });

  return true;
}

/**
 * Owns the ordinary Node lifecycle without adding placement/history state:
 * removal moves canonical subtrees to the existing Trash Node, restore appends
 * them to Home by default, and permanent deletion is restricted to Trash
 * descendants. A semantic caller may restore a canonical Node to another
 * existing system container without recording placement state.
 */
export const TanaNodeLifecyclePlugin = createPlatePlugin({
  key: TANA_NODE_LIFECYCLE_PLUGIN_KEY,
  // This semantic lifecycle boundary wraps Field and Node Identity. Those
  // plugins keep their own structural guards while ordinary block removal is
  // routed here.
  priority: -1,
})
  // Declare the public Plate transform surface. The override below supplies
  // the editor-bound implementations together with the captured raw removal
  // transform, so lifecycle moves never recurse through themselves.
  .extendEditorTransforms(() => ({
    node: {
      deletePermanently: (nodeId: NodeId): boolean => {
        void nodeId;
        return false;
      },
      restore: (nodeId: NodeId, destination?: TanaRestoreDestination): boolean => {
        void nodeId;
        void destination;
        return false;
      },
      trash: (nodeId: NodeId): boolean => {
        void nodeId;
        return false;
      },
      relocateSubtreesRaw: (
        nodes: readonly TElement[],
        paths: readonly Path[],
        at: Path
      ): boolean => {
        void nodes;
        void paths;
        void at;
        return false;
      },
      replaceSubtreesRaw: (
        paths: readonly Path[],
        insertions: readonly RawSubtreeInsertion[]
      ): boolean => {
        void paths;
        void insertions;
        return false;
      },
    },
  }))
  .overrideEditor(({ editor, tf: { removeNodes } }) => ({
  transforms: {
    node: {
      deletePermanently: (nodeId: NodeId) => deletePermanently(editor, removeNodes, nodeId),
      restore: (nodeId: NodeId, destination?: TanaRestoreDestination) =>
        restore(editor, removeNodes, nodeId, destination),
      trash: (nodeId: NodeId) => trash(editor, removeNodes, nodeId),
      relocateSubtreesRaw: (
        nodes: readonly TElement[],
        paths: readonly Path[],
        at: Path
      ) => relocateSubtreesRaw(editor, removeNodes, nodes, paths, at),
      replaceSubtreesRaw: (
        paths: readonly Path[],
        insertions: readonly RawSubtreeInsertion[]
      ) => replaceSubtreesRaw(editor, removeNodes, paths, insertions),
    },
    removeNodes(options = {}) {
      const at = Array.isArray(options.at) ? options.at : undefined;

      if (removeSelectedOrdinaryNodes(editor, removeNodes, options)) return;
      if (!at || at.length !== 1) return removeNodes(options);

      const entry = editor.api.node(at);

      if (
        !entry ||
        !ElementApi.isElement(entry[0]) ||
        !isTanaNodeElement(entry) ||
        typeof entry[0].id !== 'string' ||
        entry[0].tanaSystemNode !== undefined ||
        isFieldStructureNode(editor, entry[0] as TanaBlockElement, entry[1])
      ) {
        return removeNodes(options);
      }

      const trashNode = getSystemNodeEntry(editor, 'trash');

      if (!trashNode) return removeNodes(options);

      return isWithinSubtree(editor, entry[1], trashNode[1])
        ? deletePermanently(editor, removeNodes, entry[0].id)
        : trash(editor, removeNodes, entry[0].id);
    },
  },
}));
