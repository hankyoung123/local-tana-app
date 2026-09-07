import { BlockSelectionPlugin } from '@platejs/selection/react';
import { ElementApi, KEYS, nanoid, NodeApi } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { canMutateTanaNode } from '@/components/editor/mutation-policy';
import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  buildTanaIndex,
  getNodeReferenceCandidatesFromIndex,
  getTanaProjectionTarget,
} from '@/lib/tana/index';
import { canUseSlashCommand } from '@/lib/tana/node-behavior';
import { getTanaAncestorPaths, getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

export const TANA_REFERENCE_CLIPBOARD_MIME = 'application/x-local-tana-reference-node-ids';
export const TANA_REFERENCE_CLIPBOARD_PLUGIN_KEY = 'tanaReferenceClipboard' as const;

type ClipboardData = Pick<DataTransfer, 'getData' | 'setData'>;

function getTanaNodeEntry(editor: PlateEditor): [TanaBlockElement, Path] | undefined {
  const entry = editor.api.block();

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, Path])
    : undefined;
}

/** Copy disjoint roots in document order, always retaining the canonical target ID. */
export function getTanaReferenceClipboardNodeIds(editor: PlateEditor): NodeId[] {
  const selected = editor.plugins[BlockSelectionPlugin.key]
    ? editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({ sort: true })
    : [];
  const entries = selected.length > 0
    ? selected.filter(([node, path]) => ElementApi.isElement(node) && isTanaNodeElement(node, path))
    : (() => {
      const entry = getTanaNodeEntry(editor);
      return entry ? [entry] : [];
    })();
  const selectedIndexes = new Set(entries.map(([, path]) => path[0]));
  const index = buildTanaIndex(editor.children);
  const candidateIds = new Set(getNodeReferenceCandidatesFromIndex(index).map(({ id }) => id));

  return entries.flatMap(([node, path]) =>
    typeof node.id !== 'string' ||
    getTanaAncestorPaths(editor.children, path).some((ancestor) => selectedIndexes.has(ancestor[0]))
      ? []
      : (() => {
        const target = getTanaProjectionTarget(index, node.id);

        return target && candidateIds.has(target.id) ? [target.id] : [];
      })()
  );
}

export function writeTanaReferenceClipboardData(editor: PlateEditor, data: ClipboardData): boolean {
  const nodeIds = getTanaReferenceClipboardNodeIds(editor);

  if (nodeIds.length === 0) return false;

  data.setData(TANA_REFERENCE_CLIPBOARD_MIME, JSON.stringify(nodeIds));
  return true;
}

function readTanaReferenceClipboardData(data: Pick<DataTransfer, 'getData'>): NodeId[] | undefined {
  const encoded = data.getData(TANA_REFERENCE_CLIPBOARD_MIME);

  if (!encoded) return;

  try {
    const nodeIds: unknown = JSON.parse(encoded);

    return Array.isArray(nodeIds) &&
      nodeIds.length > 0 &&
      nodeIds.every((nodeId) => typeof nodeId === 'string' && nodeId.length > 0)
      ? nodeIds as NodeId[]
      : undefined;
  } catch {
    return;
  }
}

function isEmptyCurrentNode(editor: PlateEditor, current: [TanaBlockElement, Path]): boolean {
  return NodeApi.string(current[0]) === '' &&
    getTanaNodeDescendantPaths(editor.children, current[1]).length === 0;
}

function pasteBlockReferences(
  editor: PlateEditor,
  current: [TanaBlockElement, Path],
  targetNodeIds: readonly NodeId[]
): void {
  const [node, path] = current;
  const indent = typeof node.indent === 'number' ? node.indent : 0;
  const trailingOccurrences: TElement[] = targetNodeIds.slice(1).map((targetNodeId) => ({
    children: [{ text: '' }],
    id: nanoid(),
    indent,
    tanaReferenceTargetId: targetNodeId,
    type: node.type,
  }));

  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    node.children
      .map((_, index) => [...path, index])
      .toReversed()
      .forEach((childPath) => editor.tf.removeNodes({ at: childPath }));
    editor.tf.insertNodes({ text: '' }, { at: [...path, 0] });
    editor.tf.setNodes({ tanaReferenceTargetId: targetNodeIds[0]! }, { at: path });
    if (trailingOccurrences.length > 0) {
      editor.tf.insertNodes(trailingOccurrences, { at: [path[0] + 1] });
    }
    editor.tf.select({ path: [...path, 0], offset: 0 });
  }));
}

function pasteInlineReferences(editor: PlateEditor, targetNodeIds: readonly NodeId[]): void {
  editor.tf.withNewBatch(() => {
    targetNodeIds.forEach((targetNodeId, index) => {
      if (index > 0) editor.tf.insertText(' ');
      editor.tf.insertNodes({
        children: [{ text: '' }],
        key: targetNodeId,
        type: KEYS.mention,
      });
    });
  });
}

/** Pasting converts the current blank Node or inserts inline references at the current caret. */
export function pasteTanaReferenceOccurrences(
  editor: PlateEditor,
  targetNodeIds: readonly NodeId[]
): boolean {
  const current = getTanaNodeEntry(editor);
  const index = buildTanaIndex(editor.children);
  const candidates = new Set(
    getNodeReferenceCandidatesFromIndex(index).map(({ id }) => id)
  );

  if (
    !current ||
    !canMutateTanaNode(editor, current[1], canUseSlashCommand) ||
    targetNodeIds.length === 0 ||
    targetNodeIds.some((nodeId) => !candidates.has(nodeId))
  ) {
    return false;
  }

  if (isEmptyCurrentNode(editor, current)) {
    pasteBlockReferences(editor, current, targetNodeIds);
  } else {
    pasteInlineReferences(editor, targetNodeIds);
  }

  return true;
}

/** Handles only this app's reference MIME; all other data stays with Plate. */
export function pasteTanaReferenceClipboardData(
  editor: PlateEditor,
  data: Pick<DataTransfer, 'getData'>,
  plainText = false
): boolean {
  if (plainText) {
    const text = data.getData('text/plain');

    if (text) editor.tf.insertText(text);
    return true;
  }

  const nodeIds = readTanaReferenceClipboardData(data);

  return !!nodeIds && pasteTanaReferenceOccurrences(editor, nodeIds);
}

export const TanaReferenceClipboardPlugin = createPlatePlugin({
  key: TANA_REFERENCE_CLIPBOARD_PLUGIN_KEY,
})
  .overrideEditor(({ editor, tf: { insertData, setFragmentData } }) => ({
    transforms: {
      setFragmentData(data, originEvent) {
        setFragmentData(data, originEvent);
        // Block Selection uses the same Plate transform but does not pass the
        // DOM origin event, so this must remain independent of that optional
        // argument.
        writeTanaReferenceClipboardData(editor, data);
      },
      insertData(data) {
        const plainText = editor.meta.tanaReferencePlainPaste === true;
        delete editor.meta.tanaReferencePlainPaste;
        if (pasteTanaReferenceClipboardData(editor, data, plainText)) return;
        insertData(data);
      },
    },
  }));
