import { ElementApi, KEYS, NodeApi, RangeApi, TextApi } from 'platejs';
import type { Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { canMutateTanaNode } from '@/components/editor/mutation-policy';
import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  buildTanaIndex,
  getNodeReferenceCandidatesFromIndex,
  getTanaProjectionTarget,
  getTanaReferenceTargetResolution,
  isTanaNodeInTrash,
  isTanaNodeActive,
} from '@/lib/tana/index';
import { canDrag, canUseSlashCommand } from '@/lib/tana/node-behavior';
import { getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';
import {
  findTanaUnlinkedMentions,
  type TanaUnlinkedMention,
} from '@/lib/tana/unlinked-mentions';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';

export const TANA_REFERENCE_PLUGIN_KEY = 'tanaReference' as const;

type TanaReferenceUiOptions = {
  /** Transient occurrence-local editing state; never part of the Plate document. */
  editingReferenceId: NodeId | null;
  /** Transient inline occurrence path in the current editor context. */
  expandedInlineReferencePath: string | null;
};

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

function getIndent(node: TanaBlockElement): number {
  return typeof node.indent === 'number' ? node.indent : 0;
}

function rebaseSubtree(
  nodes: readonly TanaBlockElement[],
  sourceIndent: number,
  destinationIndent: number
): TanaBlockElement[] {
  return nodes.map((node) => ({
    ...node,
    indent: destinationIndent + getIndent(node) - sourceIndent,
  }));
}

/** Swaps a live occurrence with its canonical owner without following Reference edges. */
function bringHere(editor: PlateEditor, referenceNodeId: NodeId): boolean {
  const reference = getTanaNodeEntry(editor, referenceNodeId);
  const index = buildTanaIndex(editor.children);
  const targetResolution = reference?.[0].tanaReferenceTargetId
    ? getTanaReferenceTargetResolution(index, reference[0].tanaReferenceTargetId)
    : { status: 'missing' as const };

  if (
    !reference ||
    targetResolution.status !== 'live' ||
    !canMutateTanaNode(editor, reference[1], canDrag) ||
    getTanaNodeDescendantPaths(editor.children, reference[1]).length > 0
  ) {
    return false;
  }

  const target = getTanaNodeEntry(editor, targetResolution.target.id);

  if (!target || !canMutateTanaNode(editor, target[1], canDrag)) return false;

  const targetPaths = [target[1], ...getTanaNodeDescendantPaths(editor.children, target[1])];

  // Moving an owner into a descendant would create a physical hierarchy loop.
  if (targetPaths.some((path) => path[0] === reference[1][0])) return false;

  const targetNodes = targetPaths.map((path) => editor.api.node<TanaBlockElement>(path)?.[0]);

  if (targetNodes.some((node) => !node)) return false;

  const targetStart = target[1][0];
  const referenceStart = reference[1][0];
  const targetLength = targetPaths.length;
  const targetAtReference = rebaseSubtree(
    targetNodes as TanaBlockElement[],
    getIndent(target[0]),
    getIndent(reference[0])
  );
  const referenceAtTarget: TanaBlockElement = {
    ...reference[0],
    indent: getIndent(target[0]),
  };
  const insertions = targetStart < referenceStart
    ? [
      { at: [targetStart] as Path, nodes: [referenceAtTarget] },
      { at: [referenceStart - targetLength + 1] as Path, nodes: targetAtReference },
    ]
    : [
      { at: [referenceStart] as Path, nodes: targetAtReference },
      { at: [targetStart - 1 + targetLength] as Path, nodes: [referenceAtTarget] },
    ];

  let swapped = false;

  editor.tf.withNewBatch(() => {
    swapped = editor.getTransforms(TanaNodeLifecyclePlugin).node.replaceSubtreesRaw(
      [...targetPaths, reference[1]],
      insertions
    );
  });

  return swapped;
}

/** Opens an occurrence-local projection editor without changing the Zoom scope. */
function editTarget(editor: PlateEditor, referenceNodeId: NodeId): boolean {
  const index = buildTanaIndex(editor.children);
  const target = getTanaProjectionTarget(index, referenceNodeId);

  if (!target) return false;

  editor.setOption(TanaReferencePlugin, 'editingReferenceId', referenceNodeId);
  return true;
}

/** Returns focus to the occurrence after projection interaction. */
function focusOccurrence(editor: PlateEditor, referenceNodeId: NodeId): boolean {
  const reference = getTanaNodeEntry(editor, referenceNodeId);

  if (!reference) return false;

  editor.tf.select(editor.api.start(reference[1])!);
  editor.tf.focus();
  return true;
}

function exitEditMode(editor: PlateEditor, referenceNodeId: NodeId): boolean {
  if (editor.getOption(TanaReferencePlugin, 'editingReferenceId') === referenceNodeId) {
    editor.setOption(TanaReferencePlugin, 'editingReferenceId', null);
  }

  return focusOccurrence(editor, referenceNodeId);
}

/** Toggles one inline occurrence's derived subtree in the current UI context. */
function toggleInlineExpansion(
  editor: PlateEditor,
  occurrencePath: string,
  targetNodeId: NodeId
): boolean {
  if (
    occurrencePath.length === 0 ||
    getTanaReferenceTargetResolution(buildTanaIndex(editor.children), targetNodeId).status !== 'live'
  ) {
    return false;
  }

  editor.setOption(
    TanaReferencePlugin,
    'expandedInlineReferencePath',
    editor.getOption(TanaReferencePlugin, 'expandedInlineReferencePath') === occurrencePath
      ? null
      : occurrencePath
  );

  return true;
}

/** Restores a trashed direct target identified by a block or inline occurrence. */
function restoreTarget(editor: PlateEditor, referenceOrTargetNodeId: NodeId): boolean {
  const reference = getTanaNodeEntry(editor, referenceOrTargetNodeId);
  const targetNodeId = reference?.[0].tanaReferenceTargetId ?? referenceOrTargetNodeId;
  const index = buildTanaIndex(editor.children);
  const resolution = getTanaReferenceTargetResolution(index, targetNodeId);

  if (
    !targetNodeId ||
    resolution.status !== 'trashed-or-unavailable' ||
    !isTanaNodeInTrash(index, targetNodeId)
  ) {
    return false;
  }

  let restored = false;

  editor.tf.withNewBatch(() => {
    restored = editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(targetNodeId);
  });

  return restored;
}

/** Converts one verified current text match into an inline canonical reference. */
function linkUnlinkedMention(
  editor: PlateEditor,
  candidate: TanaUnlinkedMention
): boolean {
  const index = buildTanaIndex(editor.children);
  const current = findTanaUnlinkedMentions(index, candidate.targetNodeId).find(
    (match) =>
      match.sourceNodeId === candidate.sourceNodeId &&
      match.start === candidate.start &&
      match.end === candidate.end &&
      match.path.join('.') === candidate.path.join('.')
  );
  const source = getTanaNodeEntry(editor, candidate.sourceNodeId);
  const leaf = editor.api.node(candidate.path)?.[0];

  if (
    !current ||
    !source ||
    !TextApi.isText(leaf) ||
    !canMutateTanaNode(editor, source[1], canUseSlashCommand)
  ) {
    return false;
  }

  const targetText = index.nodesById.get(candidate.targetNodeId)?.text ?? '';

  editor.tf.withNewBatch(() => {
    editor.tf.select({
      anchor: { path: candidate.path, offset: candidate.start },
      focus: { path: candidate.path, offset: candidate.end },
    });
    editor.tf.delete();
    editor.tf.insertNodes({
      children: [{ text: '' }],
      key: candidate.targetNodeId,
      type: KEYS.mention,
      value: targetText,
    });
  });

  return true;
}

function captureAliasFromSelection(editor: PlateEditor, text: string): void {
  const selection = editor.selection;

  if (
    text !== '@' ||
    !selection ||
    !RangeApi.isExpanded(selection) ||
    selection.anchor.path[0] !== selection.focus.path[0]
  ) {
    // A fresh unselected `@` must never reuse a cancelled earlier alias.
    if (text === '@') delete editor.meta.tanaReferencePendingAlias;
    return;
  }

  const alias = editor.api.string(selection).trim();

  if (alias) editor.meta.tanaReferencePendingAlias = alias;
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
export const TanaReferencePlugin = createPlatePlugin<
  typeof TANA_REFERENCE_PLUGIN_KEY,
  TanaReferenceUiOptions
>({
  key: TANA_REFERENCE_PLUGIN_KEY,
  options: {
    editingReferenceId: null,
    expandedInlineReferencePath: null,
  },
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
      bringHere: (referenceNodeId: NodeId): boolean => {
        void referenceNodeId;
        return false;
      },
      editTarget: (referenceNodeId: NodeId): boolean => {
        void referenceNodeId;
        return false;
      },
      focusOccurrence: (referenceNodeId: NodeId): boolean => {
        void referenceNodeId;
        return false;
      },
      exitEditMode: (referenceNodeId: NodeId): boolean => {
        void referenceNodeId;
        return false;
      },
      restoreTarget: (referenceNodeId: NodeId): boolean => {
        void referenceNodeId;
        return false;
      },
      toggleInlineExpansion: (occurrencePath: string, targetNodeId: NodeId): boolean => {
        void occurrencePath;
        void targetNodeId;
        return false;
      },
      linkUnlinkedMention: (candidate: TanaUnlinkedMention): boolean => {
        void candidate;
        return false;
      },
    },
  }))
  .overrideEditor(({ editor, tf: { insertText } }) => ({
    transforms: {
      reference: {
        setTarget: (referenceNodeId: NodeId, targetNodeId: NodeId) =>
          setTarget(editor, referenceNodeId, targetNodeId),
        setTargetTitle: (targetNodeId: NodeId, title: string) =>
          setTargetTitle(editor, targetNodeId, title),
        createFromEmptyNode: (referenceNodeId: NodeId, targetNodeId: NodeId) =>
          createFromEmptyNode(editor, referenceNodeId, targetNodeId),
        bringHere: (referenceNodeId: NodeId) => bringHere(editor, referenceNodeId),
        editTarget: (referenceNodeId: NodeId) => editTarget(editor, referenceNodeId),
        focusOccurrence: (referenceNodeId: NodeId) => focusOccurrence(editor, referenceNodeId),
        exitEditMode: (referenceNodeId: NodeId) => exitEditMode(editor, referenceNodeId),
        restoreTarget: (referenceNodeId: NodeId) => restoreTarget(editor, referenceNodeId),
        toggleInlineExpansion: (occurrencePath: string, targetNodeId: NodeId) =>
          toggleInlineExpansion(editor, occurrencePath, targetNodeId),
        linkUnlinkedMention: (candidate: TanaUnlinkedMention) =>
          linkUnlinkedMention(editor, candidate),
      },
      insertText(text, options) {
        captureAliasFromSelection(editor, text);
        return insertText(text, options);
      },
    },
  }));
