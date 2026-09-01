import { ElementApi, KEYS } from 'platejs';
import type { Descendant, NodeEntry, Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  findFieldDefinitionExactMatch,
  isAdHocField,
  isAdHocFieldInputNode,
  isFieldValueValid,
  isSupertagFieldInputNode,
  getSupertagFieldInputParentId,
} from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import {
  getTanaNodeDescendantPaths,
  getTanaNodePath,
  getTanaParentPath,
} from '@/lib/tana/outliner';
import type {
  FieldBinding,
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
  const directChildPath = getTanaNodeDescendantPaths(editor.children, parentPath).find(
    (path) => getTanaParentPath(editor.children, path)?.[0] === parentPath[0]
  );

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
  fieldId: NodeId,
  defaultValue?: FieldValue
): NodeId | undefined {
  const parentEntry = getTanaNodeEntry(editor, parentNodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = fieldEntry?.[0].tanaFieldDefinition;

  if (!parentEntry || !definition) return;
  if (
    defaultValue !== undefined &&
    !isFieldValueValid(buildTanaIndex(editor.children), definition, defaultValue)
  ) {
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
      createValueNode(editor, parentIndent + 2, definition, defaultValue),
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
  const fieldEntry = getFieldNodeEntry(editor, parentNodeId, fieldId);
  const definition = getTanaNodeEntry(editor, fieldId)?.[0].tanaFieldDefinition;

  if (!fieldEntry || !definition) return false;
  if (
    value !== undefined &&
    !isFieldValueValid(buildTanaIndex(editor.children), definition, value)
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
  editor.tf.removeNodes({ at: valuePath });
  editor.tf.insertNodes(
    {
      ...valueNode,
      children: createValueChildren(value),
      tanaFieldValueType: definition.type,
    },
    { at: valuePath }
  );

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
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;

  if (!definition || !isFieldValueValid(index, definition, value)) return false;

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
  parentNodeId?: NodeId
): NodeId | undefined {
  const normalizedName = name.trim();

  if (!normalizedName) return;

  const parentEntry = parentNodeId
    ? getTanaNodeEntry(editor, parentNodeId)
    : undefined;

  if (parentNodeId && !parentEntry) return;

  const parentPath = parentEntry?.[1];
  const parentIndent = parentEntry?.[0].indent;
  const descendants = parentPath
    ? getTanaNodeDescendantPaths(editor.children, parentPath)
    : [];
  const path = parentPath
    ? [(descendants.at(-1)?.[0] ?? parentPath[0]) + 1]
    : [editor.children.length];
  const indent =
    parentPath
      ? (typeof parentIndent === 'number' ? parentIndent : 0) + 1
      : undefined;

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      ...(indent === undefined ? {} : { indent }),
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
  const optionId =
    optionEntry &&
    isTanaNodeElement(optionEntry) &&
    typeof optionEntry[0].id === 'string'
      ? optionEntry[0].id
      : undefined;

  if (!optionId) return;

  editor.tf.setNodes(
    {
      tanaFieldDefinition: {
        options: [...definition.options, optionId],
        type: 'options',
      },
    },
    { at: fieldPath }
  );

  return optionId;
}

function removeOption(editor: PlateEditor, fieldId: NodeId, optionId: NodeId) {
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = fieldEntry?.[0].tanaFieldDefinition;

  if (
    !fieldEntry ||
    definition?.type !== 'options' ||
    !definition.options.includes(optionId)
  ) {
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

  editor.tf.setNodes(
    {
      tanaFieldDefinition: {
        options: definition.options.filter((id) => id !== optionId),
        type: 'options',
      },
    },
    { at: fieldPath }
  );

  getTanaNodeDescendantPaths(editor.children, optionPath)
    .reverse()
    .forEach((path) => editor.tf.removeNodes({ at: path }));
  editor.tf.removeNodes({ at: optionPath });

  return true;
}

function bind(
  editor: PlateEditor,
  supertagId: NodeId,
  fieldId: NodeId,
  defaultValue?: FieldValue
) {
  const supertagEntry = getTanaNodeEntry(editor, supertagId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);

  if (
    !supertagEntry?.[0].tanaSupertagDefinition ||
    !fieldEntry?.[0].tanaFieldDefinition
  ) {
    return false;
  }

  if (
    defaultValue !== undefined &&
    !isFieldValueValid(
      buildTanaIndex(editor.children),
      fieldEntry[0].tanaFieldDefinition,
      defaultValue
    )
  ) {
    return false;
  }

  const definition = supertagEntry[0].tanaSupertagDefinition;

  if (definition.fields.some((binding) => binding.fieldId === fieldId)) {
    return false;
  }

  const binding: FieldBinding =
    defaultValue === undefined ? { fieldId } : { defaultValue, fieldId };

  editor.tf.setNodes(
    {
      tanaSupertagDefinition: {
        fields: [...definition.fields, binding],
      },
    },
    { at: supertagEntry[1] }
  );

  return true;
}

function unbind(editor: PlateEditor, supertagId: NodeId, fieldId: NodeId) {
  const entry = getTanaNodeEntry(editor, supertagId);
  const definition = entry?.[0].tanaSupertagDefinition;

  if (!entry || !definition?.fields.some((binding) => binding.fieldId === fieldId)) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaSupertagDefinition: {
        fields: definition.fields.filter((binding) => binding.fieldId !== fieldId),
      },
    },
    { at: entry[1] }
  );

  return true;
}

function setBindingDefault(
  editor: PlateEditor,
  supertagId: NodeId,
  fieldId: NodeId,
  defaultValue: FieldValue | undefined
) {
  const entry = getTanaNodeEntry(editor, supertagId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);
  const definition = entry?.[0].tanaSupertagDefinition;

  if (
    !entry ||
    !fieldEntry?.[0].tanaFieldDefinition ||
    !definition?.fields.some((binding) => binding.fieldId === fieldId)
  ) {
    return false;
  }

  if (
    defaultValue !== undefined &&
    !isFieldValueValid(
      buildTanaIndex(editor.children),
      fieldEntry[0].tanaFieldDefinition,
      defaultValue
    )
  ) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaSupertagDefinition: {
        fields: definition.fields.map((binding) =>
          binding.fieldId === fieldId
            ? defaultValue === undefined
              ? { fieldId }
              : { defaultValue, fieldId }
            : binding
        ),
      },
    },
    { at: entry[1] }
  );

  return true;
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
      : createDefinition(editor, choice.name, { type: 'plain' }, supertagId);

  if (!fieldId) return;

  const definition = getTanaNodeEntry(editor, supertagId)?.[0]
    .tanaSupertagDefinition;
  const alreadyBound = definition?.fields.some(
    (binding) => binding.fieldId === fieldId
  );

  if (!alreadyBound && !bind(editor, supertagId, fieldId)) return;

  const currentTemporaryPath = getTanaNodePath(editor.children, temporaryNodeId);

  if (!currentTemporaryPath) return;

  editor.tf.removeNodes({ at: currentTemporaryPath });
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

  const inputEntry = editor.api.node(nodePath) as NodeEntry<TanaBlockElement>;
  const inputIndent =
    typeof inputEntry[0].indent === 'number' ? inputEntry[0].indent : 0;

  editor.tf.setNodes(
    {
      children: [{ text: '' }],
      tanaFieldId: fieldId,
    },
    { at: nodePath }
  );
  editor.tf.insertNodes(
    createValueNode(editor, inputIndent + 1, fieldEntry[0].tanaFieldDefinition),
    { at: [nodePath[0] + 1] }
  );

  return fieldId;
}

/** Owns all document writes for Field definitions, occurrences, and values. */
export const TanaFieldPlugin = createPlatePlugin({
  key: TANA_FIELD_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  field: {
    applyDefault: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
      applyDefault(editor, nodeId, fieldId, value),
    bind: (
      supertagId: NodeId,
      fieldId: NodeId,
      defaultValue?: FieldValue
    ) => bind(editor, supertagId, fieldId, defaultValue),
    clearValue: (nodeId: NodeId, fieldId: NodeId) =>
      clearValue(editor, nodeId, fieldId),
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
      parentNodeId?: NodeId
    ) => createDefinition(editor, name, definition, parentNodeId),
    createOption: (fieldId: NodeId, name: string) =>
      createOption(editor, fieldId, name),
    deleteAdHoc: (nodeId: NodeId, fieldId: NodeId) =>
      deleteAdHoc(editor, nodeId, fieldId),
    materialize: (
      nodeId: NodeId,
      fieldId: NodeId,
      defaultValue?: FieldValue
    ) => materialize(editor, nodeId, fieldId, defaultValue),
    removeOption: (fieldId: NodeId, optionId: NodeId) =>
      removeOption(editor, fieldId, optionId),
    setBindingDefault: (
      supertagId: NodeId,
      fieldId: NodeId,
      defaultValue: FieldValue | undefined
    ) => setBindingDefault(editor, supertagId, fieldId, defaultValue),
    setValue: (nodeId: NodeId, fieldId: NodeId, value: FieldValue) =>
      setValue(editor, nodeId, fieldId, value),
    unbind: (supertagId: NodeId, fieldId: NodeId) =>
      unbind(editor, supertagId, fieldId),
    updateDefinition: (fieldId: NodeId, definition: FieldDefinition) =>
      updateDefinition(editor, fieldId, definition),
  },
}));
