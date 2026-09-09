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
  getTanaProjectionTarget,
  getSupertagInheritance,
  isTanaNodeActive,
} from '@/lib/tana/index';
import { getNodeSemanticTypes, hasNodeSemantic } from '@/lib/tana/node-semantic';
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaParentPath,
} from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

import { TanaFieldPlugin } from './tana-field-plugin';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';

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
 * Fields and values have their existing materialization path. Every other
 * direct template subtree stays a Plate subtree and is cloned structurally;
 * Reference edges are never traversed while doing so.
 */
function getTemplateSubtreePaths(editor: PlateEditor, supertagPath: number[]) {
  return getTanaDirectChildPaths(editor.children, supertagPath).flatMap((childPath) => {
    const root = editor.api.node(childPath)?.[0] as TanaBlockElement | undefined;

    if (
      !root ||
      root.tanaFieldDefinition !== undefined ||
      root.tanaFieldId !== undefined ||
      root.tanaFieldValueType !== undefined ||
      root.tanaSystemNode !== undefined
    ) {
      return [];
    }

    const subtreePaths = [
      childPath,
      ...getTanaNodeDescendantPaths(editor.children, childPath),
    ];

    return subtreePaths.every((path) => ElementApi.isElement(editor.api.node(path)?.[0]))
      ? [subtreePaths]
      : [];
  });
}

function materializeTemplateChildren(
  editor: PlateEditor,
  nodePath: number[],
  supertagPath: number[]
) {
  const target = editor.api.node(nodePath)?.[0] as TanaBlockElement | undefined;
  const template = editor.api.node(supertagPath)?.[0] as TanaBlockElement | undefined;

  if (!target || !template) return;

  const targetIndent = typeof target.indent === 'number' ? target.indent : 0;

  for (const subtreePaths of getTemplateSubtreePaths(editor, supertagPath)) {
    const root = editor.api.node(subtreePaths[0])?.[0] as TanaBlockElement | undefined;
    const rootIndent = typeof root?.indent === 'number' ? root.indent : 0;
    const insertionPath = [
      (getTanaNodeDescendantPaths(editor.children, nodePath).at(-1)?.[0] ?? nodePath[0]) +
        1,
    ];
    const idMap = new Map<NodeId, NodeId>();
    subtreePaths.forEach((path) => {
      const source = editor.api.node(path)?.[0];

      if (source && ElementApi.isElement(source) && typeof source.id === 'string') {
        idMap.set(source.id, nanoid());
      }
    });
    const clonedNodes = subtreePaths.flatMap((path) => {
      const source = editor.api.node(path)?.[0];

      if (!source || !ElementApi.isElement(source)) return [];

      const clone = structuredClone(source) as TanaBlockElement;
      const sourceIndent = typeof clone.indent === 'number' ? clone.indent : rootIndent;

      // A template's Supertag Definition identity is never copied into an
      // instance. Nested Field Definitions, occurrences, and Values remain
      // real fresh Nodes with their existing Field markers.
      delete clone.tanaSupertagDefinition;
      delete clone.tanaSystemNode;
      delete clone.tanaFieldOptional;
      delete clone.tanaFieldPinned;

      // Local Field Definition/occurrence relations follow the fresh cloned
      // identity. Reference targets and Supertag/Search definitions remain
      // direct canonical relations, so no Reference edge is traversed.
      if (clone.tanaFieldId !== undefined) {
        clone.tanaFieldId = idMap.get(clone.tanaFieldId) ?? clone.tanaFieldId;
      }
      if (clone.tanaPresentation?.hiddenFieldNodeIds) {
        clone.tanaPresentation = {
          ...clone.tanaPresentation,
          hiddenFieldNodeIds: clone.tanaPresentation.hiddenFieldNodeIds.map(
            (fieldNodeId) => idMap.get(fieldNodeId) ?? fieldNodeId
          ),
        };
      }

      return [
        {
          ...clone,
          id: idMap.get(source.id as NodeId) ?? nanoid(),
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

  const index = buildTanaIndex(editor.children);
  const existing = Array.from(index.nodesById.values()).find(
    (node) =>
      isTanaNodeActive(index, node.id) &&
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
    entry[0].tanaReferenceTargetId !== undefined ||
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

function applyInBatch(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const initialIndex = buildTanaIndex(editor.children);
  const canonicalTarget = getTanaProjectionTarget(initialIndex, nodeId);

  if (!canonicalTarget) return false;

  const nodeEntry = getTanaNodeEntry(editor, canonicalTarget.id);
  const definitionEntry = getDefinitionEntry(editor, supertagId);

  if (
    !nodeEntry ||
    !definitionEntry ||
    !isTanaNodeActive(initialIndex, canonicalTarget.id) ||
    !isTanaNodeActive(initialIndex, supertagId)
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

    fieldTransforms.materialize(canonicalTarget.id, template.fieldId);
    if (template.values.length > 0) {
      if (fieldTransforms.applyDefault(canonicalTarget.id, template.fieldId, template.values[0]!)) {
        template.values.slice(1).forEach((value) => {
          fieldTransforms.addValue(canonicalTarget.id, template.fieldId, value);
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
      materializeTemplateChildren(editor, nodePath, templateEntry[1]);
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

/** Applies through a Reference only to its direct canonical owner. */
function apply(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  let applied = false;

  editor.tf.withNewBatch(() => {
    applied = applyInBatch(editor, nodeId, supertagId);
  });

  return applied;
}

function remove(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const canonicalTarget = getTanaProjectionTarget(buildTanaIndex(editor.children), nodeId);
  const nodeEntry = canonicalTarget
    ? getTanaNodeEntry(editor, canonicalTarget.id)
    : undefined;

  if (!nodeEntry) return false;

  const currentSupertagIds = nodeEntry[0].tanaSupertagIds ?? [];
  const nextSupertagIds = currentSupertagIds.filter((id) => id !== supertagId);
  const removedMembership = nextSupertagIds.length !== currentSupertagIds.length;

  editor.tf.withNewBatch(() => {
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
  });

  return removedMembership;
}

function createAndApply(editor: PlateEditor, nodeId: NodeId, name: string): NodeId | undefined {
  if (!getTanaProjectionTarget(buildTanaIndex(editor.children), nodeId)) return;

  let supertagId: NodeId | undefined;

  editor.tf.withNewBatch(() => {
    supertagId = create(editor, name);
    if (supertagId && !applyInBatch(editor, nodeId, supertagId)) {
      supertagId = undefined;
    }
  });

  return supertagId;
}

function createInstanceInBatch(
  editor: PlateEditor,
  supertagId: NodeId,
  title = ''
): NodeId | undefined {
  const index = buildTanaIndex(editor.children);
  const definition = getDefinitionEntry(editor, supertagId);
  const homeId = index.systemNodeIds.get('home');
  const homeEntry = homeId ? getTanaNodeEntry(editor, homeId) : undefined;

  if (!definition || !homeEntry || !isTanaNodeActive(index, supertagId)) return;

  const [home, homePath] = homeEntry;
  const descendants = getTanaNodeDescendantPaths(editor.children, homePath);
  const insertionPath = [(descendants.at(-1) ?? homePath)[0] + 1];
  const indent = (typeof home.indent === 'number' ? home.indent : 0) + 1;
  let instanceId: NodeId | undefined;

  editor.tf.insertNodes(
    editor.api.create.block({ children: [{ text: title.trim() }], indent }),
    { at: insertionPath }
  );
  const entry = editor.api.node(insertionPath);

  if (!entry || !isTanaNodeElement(entry)) return;
  instanceId = typeof entry[0].id === 'string' ? entry[0].id : undefined;
  if (!instanceId || !applyInBatch(editor, instanceId, supertagId)) {
    instanceId = undefined;
  }

  return instanceId;
}

function createInstance(editor: PlateEditor, supertagId: NodeId): NodeId | undefined {
  if (editor.api.isMerging()) {
    return createInstanceInBatch(editor, supertagId);
  }

  let instanceId: NodeId | undefined;

  editor.tf.withNewBatch(() => {
    instanceId = createInstanceInBatch(editor, supertagId);
  });

  return instanceId;
}

/** Creates a canonical source instance and assigns it to one From-Supertag Value. */
function createSourceInstanceAndAssign(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  sourceSupertagId: NodeId,
  title: string
): NodeId | undefined {
  const index = buildTanaIndex(editor.children);
  const canonicalHost = getTanaProjectionTarget(index, nodeId);
  const fieldDefinition = index.nodesById.get(fieldId)?.fieldDefinition;

  if (
    !canonicalHost ||
    fieldDefinition?.type !== 'from-supertag' ||
    fieldDefinition.sourceSupertagId !== sourceSupertagId
  ) {
    return;
  }

  let instanceId: NodeId | undefined;

  const createAndAssign = () => {
    instanceId = createInstanceInBatch(editor, sourceSupertagId, title);

    if (!instanceId) return;

    const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;

    if (!fieldTransforms.materialize(canonicalHost.id, fieldId)) {
      instanceId = undefined;
      return;
    }

    const assigned = fieldTransforms.setValue(
      canonicalHost.id,
      fieldId,
      { type: 'from-supertag', value: instanceId }
    );

    if (!assigned) instanceId = undefined;
  };

  if (editor.api.isMerging()) {
    createAndAssign();
  } else {
    editor.tf.withNewBatch(createAndAssign);
  }

  return instanceId;
}

function convertToSupertag(editor: PlateEditor, nodeId: NodeId): boolean {
  const entry = getTanaNodeEntry(editor, nodeId);
  const index = buildTanaIndex(editor.children);
  const schemaId = index.systemNodeIds.get('schema');
  const schemaEntry = schemaId ? getTanaNodeEntry(editor, schemaId) : undefined;

  if (
    !entry ||
    !schemaEntry ||
    !isTanaNodeActive(index, nodeId)
  ) return false;

  const [node, nodePath] = entry;
  const semanticTypes = getNodeSemanticTypes(node, {
    document: editor.children,
    path: nodePath,
  });

  // Conversion is intentionally limited to a plain canonical Node. Existing
  // semantic owners (Reference, Search, View, Field, system, or tag
  // Definition) must keep their current identity and writer boundary.
  if (semanticTypes.length !== 1 || semanticTypes[0] !== 'content') return false;
  if (node.tanaSystemNode !== undefined || node.tanaReferenceTargetId !== undefined) {
    return false;
  }

  const descendants = getTanaNodeDescendantPaths(editor.children, nodePath);
  const subtreePaths = [nodePath, ...descendants];
  const subtreeNodes = subtreePaths.map((path) => editor.api.node<TanaBlockElement>(path)?.[0]);

  if (subtreeNodes.some((candidate) => !candidate)) return false;

  const [, schemaPath] = schemaEntry;
  const schemaIndent = typeof schemaEntry[0].indent === 'number' ? schemaEntry[0].indent : 0;
  const schemaDescendants = getTanaNodeDescendantPaths(editor.children, schemaPath);
  const destinationBeforeRemoval = (schemaDescendants.at(-1) ?? schemaPath)[0] + 1;
  const removedBeforeDestination = subtreePaths.filter(
    (path) => path[0] < destinationBeforeRemoval
  ).length;
  const destinationAfterRemoval = destinationBeforeRemoval - removedBeforeDestination;
  const sourceIndent = typeof node.indent === 'number' ? node.indent : 0;
  // Relocation preserves the existing Plate Nodes and their identities. The
  // lifecycle transform only changes their flat indent while moving them.
  const relocatedNodes = (subtreeNodes as TanaBlockElement[]).map((candidate, index) => ({
    ...candidate,
    indent: schemaIndent + 1 + ((typeof candidate.indent === 'number' ? candidate.indent : sourceIndent) - sourceIndent),
    ...(index === 0 ? { tanaSupertagDefinition: {} } : {}),
  }));

  let converted = false;
  editor.tf.withNewBatch(() => {
    if (getTanaParentPath(editor.children, nodePath)?.[0] === schemaPath[0]) {
      editor.tf.setNodes({ tanaSupertagDefinition: {} }, { at: nodePath });
      converted = true;
      return;
    }

    converted = editor
      .getTransforms(TanaNodeLifecyclePlugin)
      .node.relocateSubtreesRaw(relocatedNodes, subtreePaths, [destinationAfterRemoval]);
  });

  return converted;
}

function canonicalizeNodeIds(editor: PlateEditor, nodeIds: readonly NodeId[]) {
  const canonicalIds: NodeId[] = [];
  const seen = new Set<NodeId>();

  for (const nodeId of nodeIds) {
    const target = getTanaProjectionTarget(buildTanaIndex(editor.children), nodeId);

    if (target && !seen.has(target.id)) {
      seen.add(target.id);
      canonicalIds.push(target.id);
    }
  }

  return canonicalIds;
}

function applyMany(editor: PlateEditor, nodeIds: readonly NodeId[], supertagId: NodeId) {
  let changed = false;

  editor.tf.withNewBatch(() => {
    for (const nodeId of canonicalizeNodeIds(editor, nodeIds)) {
      changed = applyInBatch(editor, nodeId, supertagId) || changed;
    }
  });

  return changed;
}

function removeInBatch(editor: PlateEditor, nodeId: NodeId, supertagId: NodeId) {
  const canonicalTarget = getTanaProjectionTarget(buildTanaIndex(editor.children), nodeId);
  const nodeEntry = canonicalTarget
    ? getTanaNodeEntry(editor, canonicalTarget.id)
    : undefined;

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
      match: (candidate) =>
        ElementApi.isElement(candidate) &&
        candidate.type === TANA_SUPERTAG_KEY &&
        candidate.key === supertagId,
    })
  );
  entries.reverse().forEach(([, path]) => editor.tf.removeNodes({ at: path }));

  return removedMembership;
}

function removeMany(editor: PlateEditor, nodeIds: readonly NodeId[], supertagId: NodeId) {
  let changed = false;

  editor.tf.withNewBatch(() => {
    for (const nodeId of canonicalizeNodeIds(editor, nodeIds)) {
      changed = removeInBatch(editor, nodeId, supertagId) || changed;
    }
  });

  return changed;
}

/** Owns all document mutations for the existing Plate `#` Combobox workflow. */
export const TanaSupertagPlugin = createPlatePlugin({
  key: TANA_SUPERTAG_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  supertag: {
    apply: (nodeId: NodeId, supertagId: NodeId) =>
      apply(editor, nodeId, supertagId),
    create: (name: string) => create(editor, name),
    createAndApply: (nodeId: NodeId, name: string) =>
      createAndApply(editor, nodeId, name),
    createInstance: (supertagId: NodeId) => createInstance(editor, supertagId),
    createSourceInstanceAndAssign: (
      nodeId: NodeId,
      fieldId: NodeId,
      sourceSupertagId: NodeId,
      title: string
    ) => createSourceInstanceAndAssign(editor, nodeId, fieldId, sourceSupertagId, title),
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
    convertToSupertag: (nodeId: NodeId) => convertToSupertag(editor, nodeId),
    applyMany: (nodeIds: readonly NodeId[], supertagId: NodeId) =>
      applyMany(editor, nodeIds, supertagId),
    removeMany: (nodeIds: readonly NodeId[], supertagId: NodeId) =>
      removeMany(editor, nodeIds, supertagId),
    remove: (nodeId: NodeId, supertagId: NodeId) =>
      remove(editor, nodeId, supertagId),
  },
}));
