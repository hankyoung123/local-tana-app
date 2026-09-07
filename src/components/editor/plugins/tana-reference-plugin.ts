import { ElementApi, NodeApi, TextApi } from 'platejs';
import type { Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { canMutateTanaNode } from '@/components/editor/mutation-policy';
import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  buildTanaIndex,
  getNodeReferenceCandidatesFromIndex,
  isTanaNodeActive,
} from '@/lib/tana/index';
import { canUseSlashCommand } from '@/lib/tana/node-behavior';
import { getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

export const TANA_REFERENCE_PLUGIN_KEY = 'tanaReference' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, Path])
    : undefined;
}

function canSetTarget(
  editor: PlateEditor,
  referenceNodeId: NodeId,
  targetNodeId: NodeId
): [TanaBlockElement, Path] | undefined {
  const reference = getTanaNodeEntry(editor, referenceNodeId);
  const target = getTanaNodeEntry(editor, targetNodeId);
  const index = buildTanaIndex(editor.children);

  if (
    !reference ||
    !target ||
    referenceNodeId === targetNodeId ||
    target[0].tanaReferenceTargetId !== undefined ||
    !isTanaNodeActive(index, referenceNodeId) ||
    !getNodeReferenceCandidatesFromIndex(index).some(
      (candidate) => candidate.id === targetNodeId
    ) ||
    reference[0].tanaSystemNode !== undefined ||
    reference[0].tanaReferenceTargetId !== undefined
  ) {
    return;
  }

  return reference;
}

function setTarget(editor: PlateEditor, referenceNodeId: NodeId, targetNodeId: NodeId): boolean {
  const reference = canSetTarget(editor, referenceNodeId, targetNodeId);

  if (!reference) return false;

  editor.tf.setNodes({ tanaReferenceTargetId: targetNodeId }, { at: reference[1] });

  return true;
}

/** Turns only a blank ordinary Node into a block Reference without changing its NodeId. */
function createFromEmptyNode(
  editor: PlateEditor,
  referenceNodeId: NodeId,
  targetNodeId: NodeId
): boolean {
  const reference = canSetTarget(editor, referenceNodeId, targetNodeId);

  if (
    !reference ||
    NodeApi.string(reference[0]) !== '' ||
    getTanaNodeDescendantPaths(editor.children, reference[1]).length > 0 ||
    !canMutateTanaNode(editor, reference[1], canUseSlashCommand)
  ) {
    return false;
  }

  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    // The MentionInput void that captured `@` is presentation-only. Replace
    // it with one ordinary empty leaf before assigning reference semantics.
    reference[0].children
      .map((_, index) => [...reference[1], index])
      .toReversed()
      .forEach((path) => editor.tf.removeNodes({ at: path }));
    editor.tf.insertNodes({ text: '' }, { at: [...reference[1], 0] });
    editor.tf.setNodes({ tanaReferenceTargetId: targetNodeId }, { at: reference[1] });
  }));

  return true;
}

/**
 * The first direct text leaf is the canonical editable title segment. Inline
 * references, Supertag tokens, links, and other rich children stay untouched.
 */
function getTitleTextPath(target: [TanaBlockElement, Path]): Path | undefined {
  const textIndex = target[0].children.findIndex(TextApi.isText);

  return textIndex >= 0 ? [...target[1], textIndex] : undefined;
}

function setTargetTitle(editor: PlateEditor, targetNodeId: NodeId, title: string): boolean {
  const target = getTanaNodeEntry(editor, targetNodeId);

  if (!target || target[0].tanaReferenceTargetId !== undefined ||
    !isTanaNodeActive(buildTanaIndex(editor.children), targetNodeId)) return false;

  const titleTextPath = getTitleTextPath(target);

  if (titleTextPath) {
    const current = editor.api.node(titleTextPath)?.[0];

    if (TextApi.isText(current) && current.text === title) return false;

    if (!TextApi.isText(current)) return false;

    // Plate intentionally excludes `text` from setNodes. Its native text
    // transforms mutate this one leaf while retaining that leaf's marks, the
    // canonical Node, and every unrelated rich child.
    const start = { offset: 0, path: titleTextPath };

    editor.tf.withoutNormalizing(() => {
      if (current.text.length > 0) {
        editor.tf.delete({
          at: {
            anchor: start,
            focus: { offset: current.text.length, path: titleTextPath },
          },
        });
      }

      if (title.length > 0) editor.tf.insertText(title, { at: start });
    });
  } else {
    // A Node made exclusively of inline elements receives a new leading text
    // leaf; none of its existing elements are replaced or removed.
    editor.tf.insertNodes({ text: title }, { at: [...target[1], 0] });
  }

  return true;
}

/** Owns block-reference target mutations; projection rendering remains read-only. */
export const TanaReferencePlugin = createPlatePlugin({
  key: TANA_REFERENCE_PLUGIN_KEY,
  priority: 0,
})
  .extendEditorTransforms(() => ({
    reference: {
      setTarget: (referenceNodeId: NodeId, targetNodeId: NodeId): boolean => {
        void referenceNodeId;
        void targetNodeId;
        return false;
      },
      setTargetTitle: (targetNodeId: NodeId, title: string): boolean => {
        void targetNodeId;
        void title;
        return false;
      },
      createFromEmptyNode: (referenceNodeId: NodeId, targetNodeId: NodeId): boolean => {
        void referenceNodeId;
        void targetNodeId;
        return false;
      },
    },
  }))
  .overrideEditor(({ editor }) => ({
    transforms: {
      reference: {
        setTarget: (referenceNodeId: NodeId, targetNodeId: NodeId) =>
          setTarget(editor, referenceNodeId, targetNodeId),
        setTargetTitle: (targetNodeId: NodeId, title: string) =>
          setTargetTitle(editor, targetNodeId, title),
        createFromEmptyNode: (referenceNodeId: NodeId, targetNodeId: NodeId) =>
          createFromEmptyNode(editor, referenceNodeId, targetNodeId),
      },
    },
  }));
