import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  findFieldDefinitionExactMatch,
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
  FieldValueState,
  NodeId,
  TanaBlockElement,
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

function hasDirectFieldValue(
  fieldValues: Readonly<Record<NodeId, FieldValueState>> | undefined,
  fieldId: NodeId
) {
  return (
    !!fieldValues && Object.prototype.hasOwnProperty.call(fieldValues, fieldId)
  );
}

function addAdHoc(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);

  if (!nodeEntry || !fieldEntry?.[0].tanaFieldDefinition) return false;
  if (hasDirectFieldValue(nodeEntry[0].tanaFieldValues, fieldId)) return false;

  editor.tf.setNodes(
    {
      tanaFieldValues: {
        ...(nodeEntry[0].tanaFieldValues ?? {}),
        [fieldId]: null,
      },
    },
    { at: nodeEntry[1] }
  );

  return true;
}

function setValue(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  value: FieldValue
) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);

  if (!nodeEntry || !fieldEntry?.[0].tanaFieldDefinition) return false;
  if (
    !isFieldValueValid(
      buildTanaIndex(editor.children),
      fieldEntry[0].tanaFieldDefinition,
      value
    )
  ) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaFieldValues: {
        ...(nodeEntry[0].tanaFieldValues ?? {}),
        [fieldId]: value,
      },
    },
    { at: nodeEntry[1] }
  );

  return true;
}

/** Writes a template default only into a missing direct Field key. */
function applyDefault(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  value: FieldValue
) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const fieldEntry = getTanaNodeEntry(editor, fieldId);

  if (!nodeEntry || !fieldEntry?.[0].tanaFieldDefinition) return false;
  if (hasDirectFieldValue(nodeEntry[0].tanaFieldValues, fieldId)) return false;
  if (
    !isFieldValueValid(
      buildTanaIndex(editor.children),
      fieldEntry[0].tanaFieldDefinition,
      value
    )
  ) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaFieldValues: {
        ...(nodeEntry[0].tanaFieldValues ?? {}),
        [fieldId]: structuredClone(value),
      },
    },
    { at: nodeEntry[1] }
  );

  return true;
}

function clearValue(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);

  if (!nodeEntry || !hasDirectFieldValue(nodeEntry[0].tanaFieldValues, fieldId)) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaFieldValues: {
        ...(nodeEntry[0].tanaFieldValues ?? {}),
        [fieldId]: null,
      },
    },
    { at: nodeEntry[1] }
  );

  return true;
}

function deleteAdHoc(editor: PlateEditor, nodeId: NodeId, fieldId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);

  if (!nodeEntry || !hasDirectFieldValue(nodeEntry[0].tanaFieldValues, fieldId)) {
    return false;
  }

  const nextFieldValues = { ...(nodeEntry[0].tanaFieldValues ?? {}) };

  delete nextFieldValues[fieldId];

  if (Object.keys(nextFieldValues).length === 0) {
    editor.tf.unsetNodes('tanaFieldValues', { at: nodeEntry[1] });
  } else {
    editor.tf.setNodes({ tanaFieldValues: nextFieldValues }, { at: nodeEntry[1] });
  }

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

  [...getTanaNodeDescendantPaths(editor.children, optionPath), optionPath]
    .reverse()
    .forEach((path) => editor.tf.removeNodes({ at: path }));

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

  const fieldId =
    'fieldId' in choice
      ? choice.fieldId
      : (findFieldDefinitionExactMatch(buildTanaIndex(editor.children), choice.name)?.id ??
        createDefinition(editor, choice.name, { type: 'plain' }));
  const fieldEntry = fieldId ? getTanaNodeEntry(editor, fieldId) : undefined;

  if (!fieldId || !fieldEntry?.[0].tanaFieldDefinition) return;

  addAdHoc(editor, nodeId, fieldId);

  return fieldId;
}

/** Owns all document writes for Field definitions, bindings, and values. */
export const TanaFieldPlugin = createPlatePlugin({
  key: TANA_FIELD_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  field: {
    addAdHoc: (nodeId: NodeId, fieldId: NodeId) => addAdHoc(editor, nodeId, fieldId),
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
