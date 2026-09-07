import { BlockSelectionPlugin } from '@platejs/selection/react';
import { ElementApi, nanoid } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { canMutateTanaNode } from '@/components/editor/mutation-policy';
import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  buildTanaIndex,
  getNodeReferenceCandidatesFromIndex,
} from '@/lib/tana/index';
import { canIndent } from '@/lib/tana/node-behavior';
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

/** Copy only disjoint canonical roots, in document order. */
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
  const candidateIds = new Set(
    getNodeReferenceCandidatesFromIndex(buildTanaIndex(editor.children)).map(({ id }) => id)
  );

  return entries.flatMap(([node, path]) =>
    typeof node.id === 'string' &&
    candidateIds.has(node.id) &&
    !getTanaAncestorPaths(editor.children, path).some((ancestor) => selectedIndexes.has(ancestor[0]))
      ? [node.id]
      : []
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
      nodeIds.every((nodeId) => typeof nodeId === 'string' && nodeId.length > 0) &&
      new Set(nodeIds).size === nodeIds.length
      ? nodeIds as NodeId[]
      : undefined;
  } catch {
    return;
  }
}

/** Inserts fresh occurrence identities while retaining every canonical target and subtree. */
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
    !canMutateTanaNode(editor, current[1], canIndent) ||
    targetNodeIds.length === 0 ||
    new Set(targetNodeIds).size !== targetNodeIds.length ||
    targetNodeIds.some((nodeId) => !candidates.has(nodeId))
  ) {
    return false;
  }

  const currentIndent = typeof current[0].indent === 'number' ? current[0].indent : 0;
  const insertionPath = [
    (getTanaNodeDescendantPaths(editor.children, current[1]).at(-1) ?? current[1])[0] + 1,
  ] as Path;
  const occurrences: TElement[] = targetNodeIds.map((targetNodeId) => ({
    children: [{ text: '' }],
    id: nanoid(),
    indent: currentIndent,
    tanaReferenceTargetId: targetNodeId,
    type: current[0].type,
  }));

  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    editor.tf.insertNodes(occurrences, { at: insertionPath });
    editor.tf.select({ path: [...insertionPath, 0], offset: 0 });
  }));

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
