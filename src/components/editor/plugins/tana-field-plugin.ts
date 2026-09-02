import { ElementApi, KEYS } from 'platejs';
import type { Descendant, NodeEntry, Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  findFieldDefinitionExactMatch,
  isAdHocField,
  isAdHocFieldInputNode,
  isTanaFieldHostNode,
  isFieldValueValid,
  isSupertagFieldInputNode,
  getSupertagFieldInputParentId,
} from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import { getNodeSemanticTypes } from '@/lib/tana/node-semantic';
import {
  getTanaNodeDescendantPaths,
  getTanaDirectChildPaths,
  getTanaNodePath,
  getTanaParentPath,
} from '@/lib/tana/outliner';
import type {
  FieldDefinition,
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaFieldNode,
} from '@/lib/tana/types';

export const TANA_FIELD_PLUGIN_KEY = 'tanaField' as const;

export type FieldInputChoice =
  | { fieldId: NodeId }
  | { name: string; type: 'create' };

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

  if (
    !entry ||
    !ElementApi.isElement(entry[0]) ||
    !isTanaNodeElement(entry)
  ) {
    return;
  }

  const semanticTypes = getNodeSemanticTypes(entry[0] as TanaBlockElement, {
    document: editor.children,
    path: entry[1],
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

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function getDirectChildEntry(
  editor: PlateEditor,
  parentPath: Path
): NodeEntry<TanaBlockElement> | undefined {
  const directChildPath = getTanaDirectChildPaths(editor.children, parentPath)[0];

  if (!directChildPath) return;

  const entry = editor.api.node(directChildPath);

  return entry && isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function createValueChildren(value?: FieldValue): Descendant[] {
  if (!value) return [{ text: '' }];

  if (value.type === 'options' || value.type === 'from-supertag') {
    return [
      {
        children: [{ text: '' }],
        key: value.value,
        type: KEYS.mention,
      },
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
    tanaFieldValueType: definition.type,
  });
}

function getFieldInsertionPath(editor: PlateEditor, parentPath: Path): Path {
  const parentEntry = editor.api.node(parentPath) as NodeEntry<TanaBlockElement>;
  const parentIndent =
    typeof parentEntry[0].indent === 'number' ? parentEntry[0].indent : 0;
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

function getFieldNodeEntry(
  editor: PlateEditor,
  parentNodeId: NodeId,
  fieldId: NodeId
) {
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
    at: [fieldPath[0] + 1],
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
        tanaFieldId: fieldId,
      }),
      createValueNode(editor, parentIndent + 2, definition),
    ],
    { at: insertionPath }
  );

  const occurrence = editor.api.node(insertionPath);

  return occurrence &&
    isTanaNodeElement(occurrence) &&
    typeof occurrence[0].id === 'string'
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
  if (
    value !== undefined &&
    !isFieldValueValid(buildTanaIndex(editor.children), fieldId, value)
  ) {
    return false;
  }

  const valueEntry =
    getDirectChildEntry(editor, fieldEntry[1]) ??
    insertValueChild(editor, fieldEntry, definition);

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
        tanaFieldValueType: definition.type,
      },
      { at: valuePath }
    );
  });

  return true;
}

function setValue(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  value: FieldValue
) {
  return writeValue(editor, nodeId, fieldId, value);
}

/** Applies a valid template default only when the real Field Node is unset. */
function applyDefault(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  value: FieldValue
) {
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
  definition: FieldDefinition
): NodeId | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  const path = [editor.children.length];

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      tanaFieldDefinition: definition,
    }),
    { at: path }
  );

  const entry = editor.api.node(path);

  return entry &&
    isTanaNodeElement(entry) &&
    typeof entry[0].id === 'string'
    ? entry[0].id
    : undefined;
}

function updateDefinition(
  editor: PlateEditor,
  fieldId: NodeId,
  definition: FieldDefinition
) {
  const entry = getTanaNodeEntry(editor, fieldId);

  if (!entry?.[0].tanaFieldDefinition) return false;

  editor.tf.setNodes({ tanaFieldDefinition: definition }, { at: entry[1] });

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
      indent: parentIndent + 1,
    }),
    { at: path }
  );

  const optionEntry = editor.api.node(path);

  return optionEntry &&
    isTanaNodeElement(optionEntry) &&
    typeof optionEntry[0].id === 'string'
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

  if (
    !optionPath ||
    getTanaParentPath(editor.children, optionPath)?.[0] !== fieldPath[0]
  ) {
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

  const inputIndent =
    typeof inputEntry[0].indent === 'number' ? inputEntry[0].indent : 0;

  editor.tf.setNodes(
    {
      children: [{ text: '' }],
      tanaFieldId: fieldId,
    },
    { at: inputPath }
  );
  editor.tf.insertNodes(createValueNode(editor, inputIndent + 1, definition), {
    at: [inputPath[0] + 1],
  });

  const fieldEntry = editor.api.node(inputPath);

  return fieldEntry &&
    isTanaNodeElement(fieldEntry) &&
    typeof fieldEntry[0].id === 'string'
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

  const fieldId =
    'fieldId' in choice
      ? choice.fieldId
      : (findFieldDefinitionExactMatch(buildTanaIndex(editor.children), choice.name)
          ?.id ?? createDefinition(editor, choice.name, { type: 'plain' }));

  if (!fieldId) return;

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
      target: { path: supertagPath, type: 'node' },
    });
  }

  return fieldId;
}

function completeAdHocInput(
  editor: PlateEditor,
  nodeId: NodeId,
  choice: FieldInputChoice
) {
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
}).extendEditorTransforms(({ editor }) => ({
  field: {
    applyDefault: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
      applyDefault(editor, nodeId, fieldId, value),
    clearValue: (nodeId: NodeId, fieldId: NodeId) =>
      clearValue(editor, nodeId, fieldId),
    completeAdHocInput: (nodeId: NodeId, choice: FieldInputChoice) =>
      completeAdHocInput(editor, nodeId, choice),
    completeTemplateInput: (
      temporaryNodeId: NodeId,
      supertagId: NodeId,
      choice: FieldInputChoice
    ) => completeTemplateInput(editor, temporaryNodeId, supertagId, choice),
    createDefinition: (name: string, definition: FieldDefinition) =>
      createDefinition(editor, name, definition),
    createOption: (fieldId: NodeId, name: string) =>
      createOption(editor, fieldId, name),
    deleteAdHoc: (nodeId: NodeId, fieldId: NodeId) =>
      deleteAdHoc(editor, nodeId, fieldId),
    materialize: (nodeId: NodeId, fieldId: NodeId) =>
      materialize(editor, nodeId, fieldId),
    removeOption: (fieldId: NodeId, optionId: NodeId) =>
      removeOption(editor, fieldId, optionId),
    setValue: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
      setValue(editor, nodeId, fieldId, value),
    updateDefinition: (fieldId: NodeId, definition: FieldDefinition) =>
      updateDefinition(editor, fieldId, definition),
  },
})).overrideEditor(({ editor, tf: { deleteBackward, deleteForward, insertBreak, tab } }) => ({
  transforms: {
    deleteBackward(unit) {
      const entry = getActiveFieldStructureEntry(editor);

      if (entry && isAtFieldStructureEdge(editor, entry, 'start')) return;

      return deleteBackward(unit);
    },
    deleteForward(unit) {
      const entry = getActiveFieldStructureEntry(editor);

      if (entry && isAtFieldStructureEdge(editor, entry, 'end')) return;

      return deleteForward(unit);
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
  },
}));
