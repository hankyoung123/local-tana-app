import { ElementApi, KEYS } from 'platejs';
import type { Descendant, NodeEntry, Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  findFieldDefinitionExactMatch,
  isAdHocField,
  isAdHocFieldInputNode,
  isTanaFieldHostNode,
  isFieldValueValid,
  isSupertagFieldInputNode,
  getSupertagFieldInputParentId
} from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import { getNodeSemanticTypes } from '@/lib/tana/node-semantic';
import {
  getTanaNodeDescendantPaths,
  getTanaDirectChildPaths,
  getTanaNodePath,
  getTanaParentPath
} from '@/lib/tana/outliner';
import type {
  FieldDefinition,
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaFieldNode
} from '@/lib/tana/types';

export const TANA_FIELD_PLUGIN_KEY = 'tanaField' as const;

export type FieldInputChoice = { fieldId: NodeId } | { name: string; type: 'create' };

type FieldStructureEntry = NodeEntry<TanaBlockElement> & {
  0: TanaBlockElement;
};

/**
 * Field occurrences and their Value Nodes remain ordinary Plate blocks, but
 * they cannot use block transforms that would split or merge that semantic
 * unit. This is intentionally evaluated from the current Plate document: no
 * parallel interaction state is needed.
 */
function getActiveFieldStructureEntry(editor: PlateEditor): FieldStructureEntry | undefined {
  const entry = editor.api.block();

  if (!entry || !ElementApi.isElement(entry[0]) || !isTanaNodeElement(entry)) {
    return;
  }

  const semanticTypes = getNodeSemanticTypes(entry[0] as TanaBlockElement, {
    document: editor.children,
    path: entry[1]
  });

  return semanticTypes.some((semantic) => semantic === 'field' || semantic === 'value')
    ? (entry as FieldStructureEntry)
    : undefined;
}

function isAtFieldStructureEdge(
  editor: PlateEditor,
  entry: FieldStructureEntry,
  edge: 'start' | 'end'
): boolean {
  const selection = editor.selection;

  if (!selection || editor.api.isExpanded()) return false;

  return edge === 'start'
    ? editor.api.isStart(selection.anchor, entry[1])
    : editor.api.isEnd(selection.anchor, entry[1]);
}

function selectionCrossesFieldStructure(editor: PlateEditor): boolean {
  const selection = editor.selection;

  if (!selection || !editor.api.isExpanded()) return false;

  const start = Math.min(selection.anchor.path[0], selection.focus.path[0]);
  const end = Math.max(selection.anchor.path[0], selection.focus.path[0]);

  if (start === end) return false;

  return editor.children.slice(start, end + 1).some((node, offset) => {
    const path = [start + offset];

    return (
      ElementApi.isElement(node) &&
      getNodeSemanticTypes(node as TanaBlockElement, {
        document: editor.children,
        path
      }).some((semantic) => semantic === 'field' || semantic === 'value')
    );
  });
}

function getBlockSelectionIds(editor: PlateEditor): ReadonlySet<string> {
  if (!editor.plugins[BlockSelectionPlugin.key]) return new Set();

  return editor.getOption(BlockSelectionPlugin, 'selectedIds') ?? new Set();
}

function getDirectFieldPaths(editor: PlateEditor, hostPath: Path): Path[] {
  return getTanaDirectChildPaths(editor.children, hostPath).filter((path) => {
    const node = editor.api.node(path)?.[0] as TanaBlockElement | undefined;

    return typeof node?.tanaFieldId === 'string';
  });
}

function addFieldSubtreeIds(editor: PlateEditor, fieldPath: Path, targetIds: Set<string>) {
  [fieldPath, ...getTanaNodeDescendantPaths(editor.children, fieldPath)].forEach((path) => {
    const node = editor.api.node(path)?.[0] as TanaBlockElement | undefined;

    if (typeof node?.id === 'string') targetIds.add(node.id);
  });
}

/**
 * Plate Block Selection stays the selection owner. This derives the smallest
 * deletion closure that never removes a Value without its Field, or a Field
 * without its Value. A selected Value alone is left intact; a selected Field
 * (or its selected Host) removes the complete Field subtree.
 */
function getBlockSelectionRemovalIds(editor: PlateEditor) {
  const selectedIds = getBlockSelectionIds(editor);
  const removalIds = new Set(selectedIds);

  for (const nodeId of selectedIds) {
    const entry = getTanaNodeEntry(editor, nodeId);

    if (!entry) continue;

    const [node, path] = entry;

    const semantics = getNodeSemanticTypes(node, {
      document: editor.children,
      path
    });

    if (semantics.includes('value')) {
      const ownerPath = getTanaParentPath(editor.children, path);
      const ownerId = ownerPath
        ? (editor.api.node(ownerPath)?.[0] as TanaBlockElement | undefined)?.id
        : undefined;

      if (typeof ownerId !== 'string' || !selectedIds.has(ownerId)) {
        removalIds.delete(nodeId);
      }
      continue;
    }

    if (semantics.includes('field')) {
      addFieldSubtreeIds(editor, path, removalIds);
      continue;
    }

    if (isTanaFieldHostNode(editor.children, path)) {
      getDirectFieldPaths(editor, path).forEach((fieldPath) =>
        addFieldSubtreeIds(editor, fieldPath, removalIds)
      );
    }
  }

  return removalIds;
}

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry) ? (entry as NodeEntry<TanaBlockElement>) : undefined;
}

function getDirectChildEntry(
  editor: PlateEditor,
  parentPath: Path
): NodeEntry<TanaBlockElement> | undefined {
  const directChildPath = getTanaDirectChildPaths(editor.children, parentPath)[0];

  if (!directChildPath) return;

  const entry = editor.api.node(directChildPath);

  return entry && isTanaNodeElement(entry) ? (entry as NodeEntry<TanaBlockElement>) : undefined;
}

function createValueChildren(value?: FieldValue): Descendant[] {
  if (!value) return [{ text: '' }];

  if (value.type === 'options' || value.type === 'from-supertag') {
    return [
      {
        children: [{ text: '' }],
        key: value.value,
        type: KEYS.mention
      }
    ];
  }

  return [{ text: String(value.value) }];
}

function createValueNode(
  editor: PlateEditor,
  indent: number,
  definition: FieldDefinition,
  value?: FieldValue
) {
  return editor.api.create.block({
    children: createValueChildren(value),
    indent,
    tanaFieldValueType: definition.type
  });
}

function getFieldInsertionPath(editor: PlateEditor, parentPath: Path): Path {
  const parentEntry = editor.api.node(parentPath) as NodeEntry<TanaBlockElement>;
  const parentIndent = typeof parentEntry[0].indent === 'number' ? parentEntry[0].indent : 0;
  let insertionIndex = parentPath[0] + 1;

  for (let index = parentPath[0] + 1; index < editor.children.length; index += 1) {
    const candidate = editor.children[index];

    if (!ElementApi.isElement(candidate) || !isTanaNodeElement(candidate, [index])) {
      continue;
    }
    if ((typeof candidate.indent === 'number' ? candidate.indent : 0) <= parentIndent) {
      break;
    }
    if (getTanaParentPath(editor.children, [index])?.[0] !== parentPath[0]) {
      continue;
    }
    if (!(candidate as TanaBlockElement).tanaFieldId) return [index];

    const subtree = getTanaNodeDescendantPaths(editor.children, [index]);

    insertionIndex = (subtree.at(-1)?.[0] ?? index) + 1;
  }

  return [insertionIndex];
}

function getFieldNode(
  editor: PlateEditor,
  parentNodeId: NodeId,
  fieldId: NodeId
): TanaFieldNode | undefined {
  return buildTanaIndex(editor.children)
    .fieldNodesByParent.get(parentNodeId)
    ?.find((fieldNode) => fieldNode.fieldId === fieldId);
}

function getFieldNodeEntry(editor: PlateEditor, parentNodeId: NodeId, fieldId: NodeId) {
  const fieldNode = getFieldNode(editor, parentNodeId, fieldId);

  return fieldNode ? getTanaNodeEntry(editor, fieldNode.id) : undefined;
}

function insertValueChild(
  editor: PlateEditor,
  fieldEntry: NodeEntry<TanaBlockElement>,
  definition: FieldDefinition,
  value?: FieldValue
) {
  const [fieldNode, fieldPath] = fieldEntry;
  const indent = typeof fieldNode.indent === 'number' ? fieldNode.indent + 1 : 1;

  editor.tf.insertNodes(createValueNode(editor, indent, definition, value), {
    at: [fieldPath[0] + 1]
  });

  return getDirectChildEntry(editor, fieldPath);
}

/**
 * Creates a real Field occurrence and an ordinary typed value child. It never
 * stores a Field Value on the parent Node.
 */
function materialize(
  editor: PlateEditor,
  parentNodeId: NodeId,
  fieldId: NodeId
): NodeId | undefined {
  const parentEntry = getTanaNodeEntry(editor, parentNodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = fieldEntry?.[0].tanaFieldDefinition;

  if (!parentEntry || !definition || !isTanaFieldHostNode(editor.children, parentEntry[1])) {
    return;
  }
  const existing = getFieldNode(editor, parentNodeId, fieldId);

  if (existing) return existing.id;

  const [parentNode, parentPath] = parentEntry;
  const parentIndent = typeof parentNode.indent === 'number' ? parentNode.indent : 0;
  const insertionPath = getFieldInsertionPath(editor, parentPath);

  editor.tf.insertNodes(
    [
      editor.api.create.block({
        children: [{ text: '' }],
        indent: parentIndent + 1,
        tanaFieldId: fieldId
      }),
      createValueNode(editor, parentIndent + 2, definition)
    ],
    { at: insertionPath }
  );

  const occurrence = editor.api.node(insertionPath);

  return occurrence && isTanaNodeElement(occurrence) && typeof occurrence[0].id === 'string'
    ? occurrence[0].id
    : undefined;
}

function writeValue(
  editor: PlateEditor,
  parentNodeId: NodeId,
  fieldId: NodeId,
  value?: FieldValue
): boolean {
  const parentEntry = getTanaNodeEntry(editor, parentNodeId);
  const fieldEntry = getFieldNodeEntry(editor, parentNodeId, fieldId);
  const definition = getTanaNodeEntry(editor, fieldId)?.[0].tanaFieldDefinition;

  if (
    !parentEntry ||
    !fieldEntry ||
    !definition ||
    !isTanaFieldHostNode(editor.children, parentEntry[1]) ||
    fieldEntry[0].tanaFieldId !== fieldId ||
    getTanaParentPath(editor.children, fieldEntry[1])?.[0] !== parentEntry[1][0]
  ) {
    return false;
  }
  if (value !== undefined && !isFieldValueValid(buildTanaIndex(editor.children), fieldId, value)) {
    return false;
  }

  const valueEntry =
    getDirectChildEntry(editor, fieldEntry[1]) ?? insertValueChild(editor, fieldEntry, definition);

  if (!valueEntry) return false;

  const [valueNode, valuePath] = valueEntry;

  // Slate does not accept child-list replacement through setNodes. Reinsert
  // the same ordinary Node object at its path, retaining the stable NodeId.
  // Keep both transforms in Plate's normalizing transaction so Integrity does
  // not observe the intentional, momentary absence of the Value Node.
  editor.tf.withoutNormalizing(() => {
    editor.tf.removeNodes({ at: valuePath });
    editor.tf.insertNodes(
      {
        ...valueNode,
        children: createValueChildren(value),
        tanaFieldValueType: definition.type
      },
      { at: valuePath }
    );
  });

  return true;
}

function setValue(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId, value: FieldValue) {
  return writeValue(editor, nodeId, fieldId, value);
}

/** Applies a valid template default only when the real Field Node is unset. */
function applyDefault(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId, value: FieldValue) {
  const index = buildTanaIndex(editor.children);
  if (!isFieldValueValid(index, fieldId, value)) return false;

  const fieldNodeId = materialize(editor, nodeId, fieldId);

  if (!fieldNodeId) return false;
  if (buildTanaIndex(editor.children).fieldValues.get(nodeId)?.has(fieldId)) {
    return false;
  }

  return writeValue(editor, nodeId, fieldId, structuredClone(value));
}

function clearValue(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId) {
  const fieldEntry = getFieldNodeEntry(editor, nodeId, fieldId);

  if (!fieldEntry) return false;

  return writeValue(editor, nodeId, fieldId);
}

function deleteAdHoc(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId) {
  const index = buildTanaIndex(editor.children);
  const fieldNode = index.fieldNodesByParent
    .get(nodeId)
    ?.find((candidate) => candidate.fieldId === fieldId);

  if (!fieldNode || !isAdHocField(index, nodeId, fieldId)) return false;

  const fieldPath = getTanaNodePath(editor.children, fieldNode.id);

  if (!fieldPath) return false;

  getTanaNodeDescendantPaths(editor.children, fieldPath)
    .reverse()
    .forEach((path) => editor.tf.removeNodes({ at: path }));
  editor.tf.removeNodes({ at: fieldPath });

  return true;
}

function createDefinition(
  editor: PlateEditor,
  name: string,
  definition: FieldDefinition,
  ownerNodeId?: NodeId
): NodeId | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  const index = buildTanaIndex(editor.children);
  const ownerId = ownerNodeId ?? index.systemNodeIds.get('schema');
  const ownerEntry = ownerId ? getTanaNodeEntry(editor, ownerId) : undefined;

  if (!ownerEntry) return;

  const [owner, ownerPath] = ownerEntry;
  const ownerIndent = typeof owner.indent === 'number' ? owner.indent : 0;
  const descendants = getTanaNodeDescendantPaths(editor.children, ownerPath);
  const path = [(descendants.at(-1)?.[0] ?? ownerPath[0]) + 1];

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      indent: ownerIndent + 1,
      tanaFieldDefinition: definition
    }),
    { at: path }
  );

  const entry = editor.api.node(path);

  return entry && isTanaNodeElement(entry) && typeof entry[0].id === 'string'
    ? entry[0].id
    : undefined;
}

function updateDefinition(editor: PlateEditor, fieldId: NodeId, definition: FieldDefinition) {
  const entry = getTanaNodeEntry(editor, fieldId);

  if (!entry?.[0].tanaFieldDefinition) return false;

  editor.tf.setNodes({ tanaFieldDefinition: definition }, { at: entry[1] });

  return true;
}

/** Optionality belongs to the direct Supertag template binding, never the shared Definition. */
function setOptional(editor: PlateEditor, templateNodeId: NodeId, optional: boolean) {
  const entry = getTanaNodeEntry(editor, templateNodeId);

  if (!entry) return false;

  const [node, path] = entry;
  const parentPath = getTanaParentPath(editor.children, path);
  const parent = parentPath
    ? (editor.api.node(parentPath)?.[0] as TanaBlockElement | undefined)
    : undefined;

  if (
    !parent?.tanaSupertagDefinition ||
    (node.tanaFieldDefinition === undefined && node.tanaFieldId === undefined)
  ) {
    return false;
  }

  if (optional) {
    if (node.tanaFieldOptional === true) return false;
    editor.tf.setNodes({ tanaFieldOptional: true }, { at: path });
  } else {
    if (node.tanaFieldOptional !== true) return false;
    editor.tf.unsetNodes('tanaFieldOptional', { at: path });
  }

  return true;
}

/** Pinned presentation is carried by the real Field occurrence Node itself. */
function setPinned(editor: PlateEditor, fieldNodeId: NodeId, pinned: boolean) {
  const entry = getTanaNodeEntry(editor, fieldNodeId);

  if (!entry?.[0].tanaFieldId) return false;

  if (pinned) {
    if (entry[0].tanaFieldPinned === true) return false;
    editor.tf.setNodes({ tanaFieldPinned: true }, { at: entry[1] });
  } else {
    if (entry[0].tanaFieldPinned !== true) return false;
    editor.tf.unsetNodes('tanaFieldPinned', { at: entry[1] });
  }

  return true;
}

function createOption(editor: PlateEditor, fieldId: NodeId, name: string) {
  const normalizedName = name.trim();
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = fieldEntry?.[0].tanaFieldDefinition;

  if (!normalizedName || !fieldEntry || definition?.type !== 'options') return;

  const [field, fieldPath] = fieldEntry;
  const descendants = getTanaNodeDescendantPaths(editor.children, fieldPath);
  const path = [(descendants.at(-1)?.[0] ?? fieldPath[0]) + 1];
  const parentIndent = typeof field.indent === 'number' ? field.indent : 0;

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      indent: parentIndent + 1
    }),
    { at: path }
  );

  const optionEntry = editor.api.node(path);

  return optionEntry && isTanaNodeElement(optionEntry) && typeof optionEntry[0].id === 'string'
    ? optionEntry[0].id
    : undefined;
}

function removeOption(editor: PlateEditor, fieldId: NodeId, optionId: NodeId) {
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = fieldEntry?.[0].tanaFieldDefinition;

  if (!fieldEntry || definition?.type !== 'options') {
    return false;
  }

  const optionPath = getTanaNodePath(editor.children, optionId);
  const [, fieldPath] = fieldEntry;

  if (!optionPath || getTanaParentPath(editor.children, optionPath)?.[0] !== fieldPath[0]) {
    return false;
  }

  getTanaNodeDescendantPaths(editor.children, optionPath)
    .reverse()
    .forEach((path) => editor.tf.removeNodes({ at: path }));
  editor.tf.removeNodes({ at: optionPath });

  return true;
}

/** Turns the verified transient input itself into a real Field occurrence. */
function materializeInputNode(
  editor: PlateEditor,
  inputPath: Path,
  fieldId: NodeId
): NodeId | undefined {
  const inputEntry = editor.api.node(inputPath) as NodeEntry<TanaBlockElement> | undefined;
  const definition = getTanaNodeEntry(editor, fieldId)?.[0].tanaFieldDefinition;
  const parentPath = getTanaParentPath(editor.children, inputPath);

  if (
    !inputEntry ||
    !definition ||
    !parentPath ||
    !isTanaFieldHostNode(editor.children, parentPath)
  ) {
    return;
  }

  const inputIndent = typeof inputEntry[0].indent === 'number' ? inputEntry[0].indent : 0;

  editor.tf.setNodes(
    {
      children: [{ text: '' }],
      tanaFieldId: fieldId
    },
    { at: inputPath }
  );
  editor.tf.insertNodes(createValueNode(editor, inputIndent + 1, definition), {
    at: [inputPath[0] + 1]
  });

  const fieldEntry = editor.api.node(inputPath);

  return fieldEntry && isTanaNodeElement(fieldEntry) && typeof fieldEntry[0].id === 'string'
    ? fieldEntry[0].id
    : undefined;
}

function completeTemplateInput(
  editor: PlateEditor,
  temporaryNodeId: NodeId,
  supertagId: NodeId,
  choice: FieldInputChoice
) {
  const temporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

  if (
    !temporaryPath ||
    !isSupertagFieldInputNode(editor.children, temporaryPath) ||
    getSupertagFieldInputParentId(editor.children, temporaryPath) !== supertagId
  ) {
    return;
  }

  // Shared template Field: the transient blank child becomes a real Field
  // occurrence pointing at the existing Schema/shared Definition.
  if ('fieldId' in choice) {
    const fieldId = choice.fieldId;

    if (
      !getTanaNodeEntry(editor, fieldId)?.[0].tanaFieldDefinition ||
      getFieldNode(editor, supertagId, fieldId)
    ) {
      return;
    }

    const currentTemporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

    if (!currentTemporaryPath || !materializeInputNode(editor, currentTemporaryPath, fieldId)) {
      return;
    }
    const supertagPath = getTanaNodePath(editor.children, supertagId);
    const point = supertagPath ? editor.api.end(supertagPath) : undefined;

    if (supertagPath && point) {
      editor.tf.navigation.navigate({
        flash: false,
        focus: true,
        scroll: true,
        select: point,
        target: { path: supertagPath, type: 'node' }
      });
    }

    return fieldId;
  }

  const normalizedName = choice.name.trim();

  if (!normalizedName) return;

  // A name matching an existing Definition reuses it as a shared template
  // occurrence instead of duplicating the Definition.
  const exactMatch = findFieldDefinitionExactMatch(buildTanaIndex(editor.children), choice.name);

  if (exactMatch) {
    if (getFieldNode(editor, supertagId, exactMatch.id)) return;

    const currentTemporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

    if (!currentTemporaryPath || !materializeInputNode(editor, currentTemporaryPath, exactMatch.id)) {
      return;
    }
    const supertagPath = getTanaNodePath(editor.children, supertagId);
    const point = supertagPath ? editor.api.end(supertagPath) : undefined;

    if (supertagPath && point) {
      editor.tf.navigation.navigate({
        flash: false,
        focus: true,
        scroll: true,
        select: point,
        target: { path: supertagPath, type: 'node' }
      });
    }

    return exactMatch.id;
  }

  // New local Field: the transient input itself becomes the Definition Node.
  // No extra occurrence is created inside the template; applying the Supertag
  // later materializes occurrences on targets via the existing resolver.
  const currentTemporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

  if (!currentTemporaryPath) return;

  editor.tf.setNodes(
    {
      children: [{ text: normalizedName }],
      tanaFieldDefinition: { type: 'plain' }
    },
    { at: currentTemporaryPath }
  );

  const supertagPath = getTanaNodePath(editor.children, supertagId);
  const point = supertagPath ? editor.api.end(supertagPath) : undefined;

  if (supertagPath && point) {
    editor.tf.navigation.navigate({
      flash: false,
      focus: true,
      scroll: true,
      select: point,
      target: { path: supertagPath, type: 'node' }
    });
  }

  return temporaryNodeId;
}

function completeAdHocInput(editor: PlateEditor, nodeId: NodeId, choice: FieldInputChoice) {
  const nodePath = getTanaNodePath(editor.children, nodeId);

  if (!nodePath || !isAdHocFieldInputNode(editor.children, nodePath)) return;

  const parentPath = getTanaParentPath(editor.children, nodePath);
  const parentNode = parentPath ? editor.children[parentPath[0]] : undefined;
  const parentNodeId =
    parentNode && ElementApi.isElement(parentNode) && typeof parentNode.id === 'string'
      ? parentNode.id
      : undefined;
  const fieldId =
    'fieldId' in choice
      ? choice.fieldId
      : (findFieldDefinitionExactMatch(buildTanaIndex(editor.children), choice.name)?.id ??
        createDefinition(editor, choice.name, { type: 'plain' }));
  const fieldEntry = fieldId ? getTanaNodeEntry(editor, fieldId) : undefined;

  if (!parentNodeId || !fieldId || !fieldEntry?.[0].tanaFieldDefinition) return;
  if (getFieldNode(editor, parentNodeId, fieldId)) return;

  return materializeInputNode(editor, nodePath, fieldId) ? fieldId : undefined;
}

/** Owns all document writes for Field definitions, occurrences, and values. */
export const TanaFieldPlugin = createPlatePlugin({
  key: TANA_FIELD_PLUGIN_KEY,
  // Field's structural guard wraps Node Identity so block-selection removal
  // still passes through the latter's system-node boundary.
  priority: 0,
})
  .extendEditorTransforms(({ editor }) => ({
    field: {
      applyDefault: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
        applyDefault(editor, nodeId, fieldId, value),
      clearValue: (nodeId: NodeId, fieldId: NodeId) => clearValue(editor, nodeId, fieldId),
      completeAdHocInput: (nodeId: NodeId, choice: FieldInputChoice) =>
        completeAdHocInput(editor, nodeId, choice),
      completeTemplateInput: (
        temporaryNodeId: NodeId,
        supertagId: NodeId,
        choice: FieldInputChoice
      ) => completeTemplateInput(editor, temporaryNodeId, supertagId, choice),
      createDefinition: (
        name: string,
        definition: FieldDefinition,
        ownerNodeId?: NodeId
      ) => createDefinition(editor, name, definition, ownerNodeId),
      createOption: (fieldId: NodeId, name: string) => createOption(editor, fieldId, name),
      deleteAdHoc: (nodeId: NodeId, fieldId: NodeId) => deleteAdHoc(editor, nodeId, fieldId),
      materialize: (nodeId: NodeId, fieldId: NodeId) => materialize(editor, nodeId, fieldId),
      removeOption: (fieldId: NodeId, optionId: NodeId) => removeOption(editor, fieldId, optionId),
      setValue: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
        setValue(editor, nodeId, fieldId, value),
      setOptional: (templateNodeId: NodeId, optional: boolean) =>
        setOptional(editor, templateNodeId, optional),
      setPinned: (fieldNodeId: NodeId, pinned: boolean) =>
        setPinned(editor, fieldNodeId, pinned),
      updateDefinition: (fieldId: NodeId, definition: FieldDefinition) =>
        updateDefinition(editor, fieldId, definition)
    }
  }))
  .overrideEditor(
    ({
      editor,
      tf: { deleteBackward, deleteForward, deleteFragment, insertBreak, removeNodes, tab }
    }) => {
      const removeFieldSubtree = (fieldPath: Path) => {
        getTanaNodeDescendantPaths(editor.children, fieldPath)
          .reverse()
          .forEach((path) => removeNodes({ at: path }));
        removeNodes({ at: fieldPath });
      };

      return {
        transforms: {
          deleteBackward(unit) {
            const entry = getActiveFieldStructureEntry(editor);

            if (selectionCrossesFieldStructure(editor)) return;
            if (entry && isAtFieldStructureEdge(editor, entry, 'start')) return;

            return deleteBackward(unit);
          },
          deleteForward(unit) {
            const entry = getActiveFieldStructureEntry(editor);

            if (selectionCrossesFieldStructure(editor)) return;
            if (entry && isAtFieldStructureEdge(editor, entry, 'end')) return;

            return deleteForward(unit);
          },
          deleteFragment(options) {
            if (selectionCrossesFieldStructure(editor)) return;

            return deleteFragment(options);
          },
          insertBreak() {
            // A Field cannot split, and a Value must stay its Field's only direct
            // Value child. Text editing remains available through insertText.
            if (getActiveFieldStructureEntry(editor)) return;

            return insertBreak();
          },
          tab(options) {
            // Plate owns Tab/Shift+Tab. Claim the shortcut only for Field structure
            // so neither a Field nor its Value can move independently.
            if (getActiveFieldStructureEntry(editor)) return true;

            return tab(options);
          },
          removeNodes(options = {}) {
            const selectedIds = getBlockSelectionIds(editor);
            const at = Array.isArray(options.at) ? options.at : undefined;

            if (selectedIds.size === 0) return removeNodes(options);

            // Plate's public BlockSelection transform removes an id-matched set at
            // the root. Expand that set before Plate applies the removal, in one
            // normalizing transaction, so Integrity never observes a half subtree.
            if (at?.length === 0 && options.block === true && typeof options.match === 'function') {
              const removalIds = getBlockSelectionRemovalIds(editor);

              if (removalIds.size === 0) return;

              return editor.tf.withoutNormalizing(() =>
                removeNodes({
                  ...options,
                  match: (node) => typeof node.id === 'string' && removalIds.has(node.id)
                })
              );
            }

            if (!at || at.length !== 1) return removeNodes(options);

            const entry = editor.api.node(at);

            if (
              !entry ||
              !ElementApi.isElement(entry[0]) ||
              typeof entry[0].id !== 'string' ||
              !selectedIds.has(entry[0].id)
            ) {
              return removeNodes(options);
            }

            const [node, path] = entry as NodeEntry<TanaBlockElement>;

            const semantics = getNodeSemanticTypes(node, {
              document: editor.children,
              path
            });

            if (semantics.includes('value')) {
              // A Value selected without its Field is not an independently deletable
              // block. If the Field is also selected, its removal handles this Value.
              return;
            }

            if (semantics.includes('field')) {
              return editor.tf.withoutNormalizing(() => removeFieldSubtree(path));
            }

            if (isTanaFieldHostNode(editor.children, path)) {
              return editor.tf.withoutNormalizing(() => {
                getDirectFieldPaths(editor, path).reverse().forEach(removeFieldSubtree);
                removeNodes(options);
              });
            }

            return removeNodes(options);
          }
        }
      };
    }
  );
