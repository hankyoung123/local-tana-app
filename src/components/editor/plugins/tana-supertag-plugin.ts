import { ElementApi, nanoid } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana/constants';
import { getSupertagTemplateFields } from '@/lib/tana/fields';
import {
  buildTanaIndex,
  getSupertagInheritance,
  isTanaNodeActive,
} from '@/lib/tana/index';
import { hasNodeSemantic } from '@/lib/tana/node-semantic';
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
} from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

import { TanaFieldPlugin } from './tana-field-plugin';

export const TANA_SUPERTAG_PLUGIN_KEY = 'tanaSupertag' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function getDefinitionEntry(editor: PlateEditor, supertagId: NodeId) {
  const entry = getTanaNodeEntry(editor, supertagId);

  return entry &&
    hasNodeSemantic(entry[0], 'supertag-definition', {
      document: editor.children,
      path: entry[1],
    })
    ? entry
    : undefined;
}

function normalizeName(name: string) {
  return name.trim();
}

function isSelectionInNode(editor: PlateEditor, nodePath: number[]) {
  const { selection } = editor;

  return (
    !!selection &&
    [selection.anchor, selection.focus].every(
      (point) => point.path[0] === nodePath[0]
    )
  );
}

/**
 * Normal template children are copied as normal Plate Nodes only. Field
 * templates remain the FieldPlugin's responsibility, and no semantic data is
 * copied into a second entity model. Requiring an entirely plain subtree keeps
 * a malformed template from materializing Field/Value structure by accident.
 */
function getPlainTemplateSubtreePaths(editor: PlateEditor, supertagPath: number[]) {
  return getTanaDirectChildPaths(editor.children, supertagPath).flatMap((childPath) => {
    const subtreePaths = [
      childPath,
      ...getTanaNodeDescendantPaths(editor.children, childPath),
    ];
    const isPlainSubtree = subtreePaths.every((path) => {
      const entry = editor.api.node(path);

      if (!entry || !ElementApi.isElement(entry[0])) return false;

      const node = entry[0] as TanaBlockElement;

      return (
        node.tanaFieldDefinition === undefined &&
        node.tanaFieldId === undefined &&
        node.tanaFieldValueType === undefined &&
        node.tanaReferenceTargetId === undefined &&
        node.tanaSearchDefinition === undefined &&
        node.tanaSupertagIds === undefined &&
        node.tanaSupertagDefinition === undefined &&
        node.tanaSystemNode === undefined &&
        node.tanaTime === undefined &&
        node.tanaViewDefinition === undefined
      );
    });

    return isPlainSubtree ? [subtreePaths] : [];
  });
}

function materializePlainTemplateChildren(
  editor: PlateEditor,
  nodePath: number[],
  supertagPath: number[]
) {
  const target = editor.api.node(nodePath)?.[0] as TanaBlockElement | undefined;
  const template = editor.api.node(supertagPath)?.[0] as TanaBlockElement | undefined;

  if (!target || !template) return;

  const targetIndent = typeof target.indent === 'number' ? target.indent : 0;

  for (const subtreePaths of getPlainTemplateSubtreePaths(editor, supertagPath)) {
    const root = editor.api.node(subtreePaths[0])?.[0] as TanaBlockElement | undefined;
    const rootIndent = typeof root?.indent === 'number' ? root.indent : 0;
    const insertionPath = [
      (getTanaNodeDescendantPaths(editor.children, nodePath).at(-1)?.[0] ?? nodePath[0]) +
        1,
    ];
    const clonedNodes = subtreePaths.flatMap((path) => {
      const source = editor.api.node(path)?.[0];

      if (!source || !ElementApi.isElement(source)) return [];

      const clone = structuredClone(source) as TanaBlockElement;
      const sourceIndent = typeof clone.indent === 'number' ? clone.indent : rootIndent;

      return [
        {
          ...clone,
          id: nanoid(),
          indent: targetIndent + 1 + (sourceIndent - rootIndent),
        },
      ];
    });

    if (clonedNodes.length === subtreePaths.length) {
      editor.tf.insertNodes(clonedNodes, { at: insertionPath });
    }
  }
}

function create(editor: PlateEditor, name: string): NodeId | undefined {
  const normalizedName = normalizeName(name);

  if (!normalizedName) return;

  const existing = Array.from(buildTanaIndex(editor.children).nodesById.values()).find(
    (node) =>
      node.supertagDefinition &&
      node.text.trim().localeCompare(normalizedName, undefined, {
        sensitivity: 'accent',
        usage: 'search',
      }) === 0
  );

  if (existing) return existing.id;

  const schemaId = buildTanaIndex(editor.children).systemNodeIds.get('schema');
  const schemaEntry = schemaId ? getTanaNodeEntry(editor, schemaId) : undefined;

  if (!schemaEntry) return;

  const [schema, schemaPath] = schemaEntry;
  const schemaIndent = typeof schema.indent === 'number' ? schema.indent : 0;
  const descendants = getTanaNodeDescendantPaths(editor.children, schemaPath);
  const path = [(descendants.at(-1)?.[0] ?? schemaPath[0]) + 1];

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: normalizedName }],
      indent: schemaIndent + 1,
      tanaSupertagDefinition: {},
    }),
    { at: path }
  );

  const definition = editor.api.node(path);

  return definition &&
    isTanaNodeElement(definition) &&
    typeof definition[0].id === 'string'
    ? definition[0].id
    : undefined;
}

function define(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry ||
    hasNodeSemantic(entry[0], 'supertag-definition', {
      document: editor.children,
      path: entry[1],
    })
  ) {
    return false;
  }

  editor.tf.setNodes({ tanaSupertagDefinition: {} }, { at: entry[1] });

  return true;
}

/**
 * A writer validates the whole inheritance edge before it reaches the Plate
 * document. `TanaIndex` remains free to derive broken historical data, while
 * ordinary UI actions can never create a cyclic Definition graph.
 */
function setExtends(
  editor: PlateEditor,
  supertagId: NodeId,
  parentIds: readonly NodeId[]
) {
  const entry = getDefinitionEntry(editor, supertagId);

  if (!entry || !Array.isArray(parentIds)) return false;

  const uniqueParentIds = Array.from(new Set(parentIds));
  const index = buildTanaIndex(editor.children);

  if (
    uniqueParentIds.some(
      (parentId) =>
        parentId === supertagId ||
        !getDefinitionEntry(editor, parentId) ||
        getSupertagInheritance(index, parentId).includes(supertagId)
    )
  ) {
    return false;
  }

  const current = entry[0].tanaSupertagDefinition?.extends ?? [];

  if (
    current.length === uniqueParentIds.length &&
    current.every((parentId, index) => parentId === uniqueParentIds[index])
  ) {
    return false;
  }

  const nextDefinition = { ...entry[0].tanaSupertagDefinition };

  if (uniqueParentIds.length > 0) {
    nextDefinition.extends = uniqueParentIds;
  } else {
    delete nextDefinition.extends;
  }

  editor.tf.setNodes({ tanaSupertagDefinition: nextDefinition }, { at: entry[1] });

  return true;
}

function getDefaultChildSupertagId(editor: PlateEditor, ownerId: NodeId) {
  const index = buildTanaIndex(editor.children);
  const owner = index.nodesById.get(ownerId);

  if (!owner) return;
  const ownDefault = (owner.node as TanaBlockElement).tanaDefaultChildSupertagId;

  if (ownDefault && getDefinitionEntry(editor, ownDefault)) return ownDefault;

  for (const supertagId of owner.supertagIds) {
    const definitionIds = [
      supertagId,
      ...getSupertagInheritance(index, supertagId).slice().reverse(),
    ];

    for (const definitionId of definitionIds) {
      const defaultChildSupertagId =
        index.nodesById.get(definitionId)?.supertagDefinition?.defaultChildSupertagId;

      if (defaultChildSupertagId && getDefinitionEntry(editor, defaultChildSupertagId)) {
        return defaultChildSupertagId;
      }
    }
  }
}

/** Applies an already-configured child tag after Plate creates an ordinary Node. */
function applyDefaultChild(editor: PlateEditor, childNodeId: NodeId) {
  const childEntry = getTanaNodeEntry(editor, childNodeId);

  if (!childEntry) return false;

  const [child] = childEntry;

  if (
    child.tanaFieldDefinition !== undefined ||
    child.tanaFieldId !== undefined ||
    child.tanaFieldValueType !== undefined ||
    child.tanaSystemNode !== undefined
  ) {
    return false;
  }

  // Parentage is derived exclusively from flat indent and document order.
  const parentNode = buildTanaIndex(editor.children).parentNodeIds.get(childNodeId);
  const defaultChildSupertagId = parentNode
    ? getDefaultChildSupertagId(editor, parentNode)
    : undefined;

  return defaultChildSupertagId
    ? apply(editor, childNodeId, defaultChildSupertagId)
    : false;
}

function setDefaultChildSupertag(
  editor: PlateEditor,
  ownerNodeId: NodeId,
  defaultChildSupertagId: NodeId | null
) {
  const entry = getTanaNodeEntry(editor, ownerNodeId);

  if (!entry || entry[0].tanaSystemNode !== undefined) return false;
  if (defaultChildSupertagId !== null && !getDefinitionEntry(editor, defaultChildSupertagId)) {
    return false;
  }

  const [node, path] = entry;

  if (node.tanaSupertagDefinition !== undefined) {
    const current = node.tanaSupertagDefinition.defaultChildSupertagId;

    if (current === defaultChildSupertagId) return false;
    const rest = { ...node.tanaSupertagDefinition };

    delete rest.defaultChildSupertagId;

    editor.tf.setNodes(
      {
        tanaSupertagDefinition:
          defaultChildSupertagId === null
            ? rest
            : { ...rest, defaultChildSupertagId },
      },
      { at: path }
    );
    return true;
  }

  if (node.tanaDefaultChildSupertagId === defaultChildSupertagId) return false;
  if (defaultChildSupertagId === null) {
    editor.tf.unsetNodes('tanaDefaultChildSupertagId', { at: path });
  } else {
    editor.tf.setNodes({ tanaDefaultChildSupertagId: defaultChildSupertagId }, { at: path });
  }

  return true;
}

function setTitleExpression(editor: PlateEditor, supertagId: NodeId, expression: string) {
  const entry = getDefinitionEntry(editor, supertagId);

  if (!entry) return false;

  const [node, path] = entry;
  const nextExpression = expression.trim();
  const current = node.tanaSupertagDefinition?.titleExpression ?? '';

  if (current === nextExpression) return false;

  const definition = { ...node.tanaSupertagDefinition };

  if (nextExpression) {
    definition.titleExpression = nextExpression;
  } else {
    delete definition.titleExpression;
  }

  editor.tf.setNodes({ tanaSupertagDefinition: definition }, { at: path });

  return true;
}

function apply(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);
  const definitionEntry = getDefinitionEntry(editor, supertagId);
  const index = buildTanaIndex(editor.children);

  if (
    !nodeEntry ||
    !definitionEntry ||
    !isTanaNodeActive(index, nodeId) ||
    !isTanaNodeActive(index, supertagId)
  ) {
    return false;
  }

  const currentSupertagIds = nodeEntry[0].tanaSupertagIds ?? [];

  if (currentSupertagIds.includes(supertagId)) return false;

  const [, nodePath] = nodeEntry;
  editor.tf.setNodes(
    { tanaSupertagIds: [...currentSupertagIds, supertagId] },
    { at: nodePath }
  );

  const updatedIndex = buildTanaIndex(editor.children);
  const templates = getSupertagTemplateFields(updatedIndex, supertagId);
  templates.forEach((template) => {
    if (template.optional) return;

    const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;

    fieldTransforms.materialize(nodeId, template.fieldId);
    if (template.values.length > 0) {
      if (fieldTransforms.applyDefault(nodeId, template.fieldId, template.values[0]!)) {
        template.values.slice(1).forEach((value) => {
          fieldTransforms.addValue(nodeId, template.fieldId, value);
        });
      }
    }
  });
  const templateDefinitionIds = [
    ...getSupertagInheritance(updatedIndex, supertagId),
    supertagId,
  ];
  templateDefinitionIds.forEach((templateDefinitionId) => {
    const templateEntry = getDefinitionEntry(editor, templateDefinitionId);

    if (templateEntry) {
      materializePlainTemplateChildren(editor, nodePath, templateEntry[1]);
    }
  });

  const selectionIsInNode = isSelectionInNode(editor, nodePath);

  const hasPresentationToken = Array.from(
    editor.api.nodes({
      at: nodePath,
      match: (node) =>
        ElementApi.isElement(node) &&
        node.type === TANA_SUPERTAG_KEY &&
        node.key === supertagId,
    })
  ).length > 0;

  if (!hasPresentationToken) {
    editor.tf.insertNodes(
      {
        children: [{ text: '' }],
        key: supertagId,
        type: TANA_SUPERTAG_KEY,
      },
      {
        at: selectionIsInNode ? editor.selection! : editor.api.end(nodePath),
      }
    );
  }

  if (!selectionIsInNode || hasPresentationToken) return true;

  editor.tf.move({ unit: 'offset' });

  const currentBlockPath = editor.api.block()?.[1];

  if (
    editor.selection &&
    currentBlockPath &&
    editor.api.isEnd(editor.selection.anchor, currentBlockPath)
  ) {
    editor.tf.insertText(' ');
  }

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const nodeEntry = getTanaNodeEntry(editor, nodeId);

  if (!nodeEntry) return false;

  const currentSupertagIds = nodeEntry[0].tanaSupertagIds ?? [];
  const nextSupertagIds = currentSupertagIds.filter((id) => id !== supertagId);
  const removedMembership = nextSupertagIds.length !== currentSupertagIds.length;

  if (removedMembership) {
    if (nextSupertagIds.length === 0) {
      editor.tf.unsetNodes('tanaSupertagIds', { at: nodeEntry[1] });
    } else {
      editor.tf.setNodes({ tanaSupertagIds: nextSupertagIds }, { at: nodeEntry[1] });
    }
  }

  const entries = Array.from(
    editor.api.nodes({
      at: nodeEntry[1],
      match: (node) =>
        ElementApi.isElement(node) &&
        node.type === TANA_SUPERTAG_KEY &&
        node.key === supertagId,
    })
  );

  entries.reverse().forEach(([, path]) => editor.tf.removeNodes({ at: path }));

  return removedMembership;
}

/** Owns all document mutations for the existing Plate `#` Combobox workflow. */
export const TanaSupertagPlugin = createPlatePlugin({
  key: TANA_SUPERTAG_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  supertag: {
    apply: (nodeId: NodeId, supertagId: NodeId) =>
      apply(editor, nodeId, supertagId),
    create: (name: string) => create(editor, name),
    define: (nodeId: NodeId) => define(editor, nodeId),
    applyDefaultChild: (childNodeId: NodeId) => applyDefaultChild(editor, childNodeId),
    setDefaultChildSupertag: (
      ownerNodeId: NodeId,
      defaultChildSupertagId: NodeId | null
    ) => setDefaultChildSupertag(editor, ownerNodeId, defaultChildSupertagId),
    setExtends: (supertagId: NodeId, parentIds: readonly NodeId[]) =>
      setExtends(editor, supertagId, parentIds),
    setTitleExpression: (supertagId: NodeId, expression: string) =>
      setTitleExpression(editor, supertagId, expression),
    remove: (nodeId: NodeId, supertagId: NodeId) =>
      remove(editor, nodeId, supertagId),
  },
}));
