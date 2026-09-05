import { isTanaQueryAst, isTanaQueryPredicateAst } from '@/lib/tana/query-ast';
import { ElementApi, KEYS } from 'platejs';
import type { Path, TElement, Value } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement, TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import { isTanaFieldHostNode } from '@/lib/tana/fields';
import { getTanaParentPath } from '@/lib/tana/outliner';
import {
  getNodeSemanticTypes,
  hasNodeSemantic,
  type TanaNodeSemanticType,
} from '@/lib/tana/node-semantic';
import type {
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaQueryExpression,
  TanaQueryPredicate,
} from '@/lib/tana/types';

export const TANA_INTEGRITY_PLUGIN_KEY = 'tanaIntegrity' as const;

/**
 * NodeId relations currently owned by integrity:
 *
 * inline
 * - mention.key (dangling references are intentionally preserved as broken)
 * - supertag.key (presentation token only)
 * - tanaSupertagIds (semantic membership)
 * - supertag-definition.extends (ordered Definition inheritance)
 * - default child Supertag targets (node and Definition configuration)
 *
 * field
 * - Field Definition Node identity
 * - field occurrence.tanaFieldId
 * - value child.tanaFieldValueType (structure only; Fields allow 0..N Values)
 * - presentation.hiddenFieldNodeIds
 * - from-supertag.sourceSupertagId
 * - value-node mention.key
 *
 * reference
 * - tanaReferenceTargetId (dangling references are intentionally preserved as broken)
 *
 * search
 * - query fieldId
 * - query supertagId
 * - query reference-like FieldValue.value
 *
 * Options intentionally have no duplicated NodeId relation here: their
 * candidates and order are direct Field Definition child Nodes.
 */
export type TanaNodeEntry = [TanaBlockElement, Path];
type RelationElement = TElement & { key?: unknown };

export type TanaNodeIntegrityIssue =
  | 'field-definition-field-conflict'
  | 'invalid-field-host'
  | 'invalid-supertag-inheritance'
  | 'invalid-supertag-definition'
  | 'invalid-value-owner'
  | 'missing-default-child-supertag'
  | 'missing-from-supertag-source'
  | 'missing-supertag-membership'
  | 'invalid-search-query'
  | 'invalid-view-definition';

type TanaNodeIntegrityContext = {
  document: Value;
  entries: readonly TanaNodeEntry[];
  fieldDefinitions: ReadonlyMap<
    NodeId,
    NonNullable<TanaBlockElement['tanaFieldDefinition']>
  >;
  fieldDefinitionIds: ReadonlySet<NodeId>;
  nodeIds: ReadonlySet<NodeId>;
  supertagDefinitionIds: ReadonlySet<NodeId>;
};

function hasInvalidSupertagInheritance(
  node: TanaBlockElement,
  context: TanaNodeIntegrityContext
): boolean {
  const extendsIds = node.tanaSupertagDefinition?.extends;

  if (extendsIds === undefined) return false;
  if (
    !Array.isArray(extendsIds) ||
    new Set(extendsIds).size !== extendsIds.length ||
    extendsIds.some(
      (parentId) =>
        typeof parentId !== 'string' ||
        !context.supertagDefinitionIds.has(parentId)
    )
  ) {
    return true;
  }

  if (typeof node.id !== 'string') return true;
  const entriesById = new Map(
    context.entries.flatMap(([entry]) =>
      typeof entry.id === 'string' ? [[entry.id, entry] as const] : []
    )
  );
  const visiting = new Set<NodeId>();

  const visit = (id: NodeId): boolean => {
    if (visiting.has(id)) return true;

    const candidate = entriesById.get(id);
    const parents = candidate?.tanaSupertagDefinition?.extends ?? [];

    visiting.add(id);
    const cyclic = parents.some(
      (parentId) => typeof parentId === 'string' && visit(parentId)
    );
    visiting.delete(id);

    return cyclic;
  };

  return visit(node.id);
}

function hasMissingDefaultChildSupertag(
  node: TanaBlockElement,
  context: TanaNodeIntegrityContext
): boolean {
  const targetId =
    node.tanaDefaultChildSupertagId ??
    node.tanaSupertagDefinition?.defaultChildSupertagId;

  return targetId !== undefined && !context.supertagDefinitionIds.has(targetId);
}

function supertagParentReaches(
  parentId: NodeId,
  targetId: NodeId,
  context: TanaNodeIntegrityContext,
  visited = new Set<NodeId>()
): boolean {
  if (parentId === targetId) return true;
  if (visited.has(parentId)) return false;

  visited.add(parentId);
  const parent = context.entries.find(([node]) => node.id === parentId)?.[0];

  return (parent?.tanaSupertagDefinition?.extends ?? []).some(
    (ancestorId) =>
      typeof ancestorId === 'string' &&
      supertagParentReaches(ancestorId, targetId, context, visited)
  );
}

function getTanaNodeEntries(editor: PlateEditor): TanaNodeEntry[] {
  return editor.children.flatMap((node, index) => {
    const path = [index];

    return ElementApi.isElement(node) && isTanaNodeElement(node, path)
      ? [[node as TanaBlockElement, path]]
      : [];
  });
}

function getNodeIds(entries: readonly TanaNodeEntry[]): ReadonlySet<NodeId> {
  return new Set(
    entries.flatMap(([node]) =>
      typeof node.id === 'string' && node.id.length > 0 ? [node.id] : []
    )
  );
}

function findDanglingNonReferenceInlineRelation(
  entries: readonly TanaNodeEntry[],
  document: Value,
  nodeIds: ReadonlySet<NodeId>
): Path | undefined {
  function visit(
    node: TElement,
    path: Path,
    sourceIsValueNode: boolean
  ): Path | undefined {
    const targetNodeId = (node as RelationElement).key;

    if (
      (node.type === TANA_SUPERTAG_KEY ||
        (sourceIsValueNode && node.type === KEYS.mention)) &&
      typeof targetNodeId === 'string' &&
      !nodeIds.has(targetNodeId)
    ) {
      return path;
    }

    for (const [index, child] of node.children.entries()) {
      if (!ElementApi.isElement(child)) continue;

      const dangling = visit(child, [...path, index], sourceIsValueNode);

      if (dangling) return dangling;
    }
  }

  for (const [node, path] of entries) {
    const dangling = visit(
      node,
      path,
      getNodeSemanticTypes(node, { document, path }).includes('value')
    );

    if (dangling) return dangling;
  }
}

function isReferenceLikeFieldValue(
  value: FieldValue | undefined
): value is Extract<FieldValue, { type: 'from-supertag' | 'options' }> {
  return value?.type === 'from-supertag' || value?.type === 'options';
}

function pruneHiddenFieldNodeIds(
  editor: PlateEditor,
  node: TanaBlockElement,
  path: Path,
  nodeIds: ReadonlySet<NodeId>
) {
  const hiddenFieldNodeIds = node.tanaPresentation?.hiddenFieldNodeIds;

  if (!hiddenFieldNodeIds) return false;

  const nextIds = hiddenFieldNodeIds.filter((fieldNodeId) => {
    if (!nodeIds.has(fieldNodeId)) return false;

    const fieldPath = editor.children.findIndex(
      (candidate) => ElementApi.isElement(candidate) && candidate.id === fieldNodeId
    );
    const fieldNode = fieldPath >= 0 ? editor.children[fieldPath] : undefined;

    return (
      fieldPath >= 0 &&
      ElementApi.isElement(fieldNode) &&
      !!(fieldNode as TanaBlockElement).tanaFieldId &&
      getTanaParentPath(editor.children, [fieldPath])?.[0] === path[0]
    );
  });

  if (nextIds.length === hiddenFieldNodeIds.length) return false;

  if (nextIds.length === 0) {
    editor.tf.unsetNodes('tanaPresentation', { at: path });
  } else {
    editor.tf.setNodes(
      { tanaPresentation: { hiddenFieldNodeIds: nextIds } },
      { at: path }
    );
  }

  return true;
}

function isTanaQueryPredicateValid(
  predicate: TanaQueryPredicate,
  context: Pick<
    TanaNodeIntegrityContext,
    'fieldDefinitionIds' | 'nodeIds' | 'supertagDefinitionIds'
  >
): boolean {
  if (!isTanaQueryPredicateAst(predicate)) return false;
  switch (predicate.kind) {
    case 'field-defined':
    case 'field-exists':
      return context.fieldDefinitionIds.has(predicate.fieldId);
    case 'field-equals':
      return (
        context.fieldDefinitionIds.has(predicate.fieldId) &&
        (!isReferenceLikeFieldValue(predicate.value) ||
          context.nodeIds.has(predicate.value.value))
      );
    case 'has-supertag':
      return context.supertagDefinitionIds.has(predicate.supertagId);
    case 'text-contains':
      return true;
    case 'child-of':
    case 'descendant-of':
    case 'references':
    case 'referenced-by':
      return context.nodeIds.has(predicate.nodeId);
  }
}

function isTanaQueryExpressionValid(
  expression: TanaQueryExpression | undefined,
  context: Pick<
    TanaNodeIntegrityContext,
    'fieldDefinitionIds' | 'nodeIds' | 'supertagDefinitionIds'
  >
): boolean {
  if (!isTanaQueryAst(expression)) return false;

  switch (expression.type) {
    case 'predicate':
      return isTanaQueryPredicateValid(expression.predicate, context);
    case 'not':
      return isTanaQueryExpressionValid(expression.child, context);
    case 'and':
    case 'or':
      return Array.isArray(expression.children) && expression.children.every((child) =>
        isTanaQueryExpressionValid(child, context)
      );
    default:
      return false;
  }
}

function pruneTanaQueryExpression(
  expression: TanaQueryExpression | undefined,
  context: Pick<
    TanaNodeIntegrityContext,
    'fieldDefinitionIds' | 'nodeIds' | 'supertagDefinitionIds'
  >
): TanaQueryExpression | undefined {
  if (!isTanaQueryAst(expression)) return;

  switch (expression.type) {
    case 'predicate':
      return isTanaQueryPredicateValid(expression.predicate, context)
        ? expression
        : undefined;
    case 'not': {
      const child = pruneTanaQueryExpression(expression.child, context);

      return child ? { child, type: 'not' } : undefined;
    }
    case 'and':
    case 'or':
      return {
        children: expression.children.flatMap((child) => {
          const next = pruneTanaQueryExpression(child, context);

          return next ? [next] : [];
        }),
        type: expression.type,
      };
  }
}

function getSemanticNodeIds(
  entries: readonly TanaNodeEntry[],
  document: Value,
  semantic: 'field-definition' | 'supertag-definition'
): ReadonlySet<NodeId> {
  return new Set(
    entries.flatMap(([node, path]) =>
      typeof node.id === 'string' &&
      hasNodeSemantic(node, semantic, { document, path })
        ? [node.id]
        : []
    )
  );
}

function getFieldDefinitions(
  entries: readonly TanaNodeEntry[],
  document: Value
) {
  return new Map(
    entries.flatMap(([node, path]) =>
      typeof node.id === 'string' &&
      hasNodeSemantic(node, 'field-definition', { document, path }) &&
      node.tanaFieldDefinition
        ? [[node.id, node.tanaFieldDefinition] as const]
        : []
    )
  );
}

function getEntryAtPath(
  entries: readonly TanaNodeEntry[],
  path: Path
): TanaBlockElement | undefined {
  return entries.find(([, candidatePath]) => candidatePath[0] === path[0])?.[0];
}

type TanaNodeIntegrityValidator = (
  node: TanaBlockElement,
  path: Path,
  context: TanaNodeIntegrityContext
) => TanaNodeIntegrityIssue | undefined;

const NodeIntegrityValidators: Partial<
  Record<TanaNodeSemanticType, TanaNodeIntegrityValidator>
> = {
  'field-definition': (node, path, context) => {
    if (
      node.tanaFieldDefinition?.type === 'from-supertag' &&
      node.tanaFieldDefinition.sourceSupertagId !== null &&
      !context.nodeIds.has(node.tanaFieldDefinition.sourceSupertagId)
    ) {
      return 'missing-from-supertag-source';
    }
  },
  'supertag-definition': (node, _, context) => {
    const definition = node.tanaSupertagDefinition;

    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
      return 'invalid-supertag-definition';
    }

    return hasInvalidSupertagInheritance(node, context)
      ? 'invalid-supertag-inheritance'
      : undefined;
  },
  field: (node, path, context) => {
    if (node.tanaFieldDefinition) return 'field-definition-field-conflict';

    const fieldId = node.tanaFieldId;
    const definition = fieldId ? context.fieldDefinitions.get(fieldId) : undefined;

    const parentPath = getTanaParentPath(context.document, path);
    if (
      !parentPath ||
      !isTanaFieldHostNode(context.document, parentPath)
    ) {
      return 'invalid-field-host';
    }

    // A Field occurrence is cardinality-ready: its direct Value Node count is
    // structural data, not an Integrity repair target.
    void definition;
  },
  value: (node, path, context) => {
    const parentPath = getTanaParentPath(context.document, path);
    const parent = parentPath ? getEntryAtPath(context.entries, parentPath) : undefined;
    const definition = parent?.tanaFieldId
      ? context.fieldDefinitions.get(parent.tanaFieldId)
      : undefined;

    if (!parent?.tanaFieldId || (definition && node.tanaFieldValueType !== definition.type)) {
      return 'invalid-value-owner';
    }
  },
  search: (node, _, context) => {
    return isTanaQueryExpressionValid(node.tanaSearchDefinition?.query, context)
      ? undefined
      : 'invalid-search-query';
  },
  view: (node) =>
    node.tanaViewDefinition?.type === 'outline' ||
    node.tanaViewDefinition?.type === 'table' ||
    node.tanaViewDefinition?.type === 'calendar' ||
    node.tanaViewDefinition?.type === 'cards'
      ? undefined
      : 'invalid-view-definition',
};

/**
 * Validates the semantic invariants for one existing Plate Node. It only reads
 * the document and current hierarchy; writers remain responsible for creating
 * valid structures in the first place.
 */
export function validateNode(
  node: TanaBlockElement,
  path: Path,
  context: TanaNodeIntegrityContext
): TanaNodeIntegrityIssue | undefined {
  if (
    node.tanaSupertagIds?.some(
      (supertagId) => !context.supertagDefinitionIds.has(supertagId)
    )
  ) {
    return 'missing-supertag-membership';
  }

  if (hasMissingDefaultChildSupertag(node, context)) {
    return 'missing-default-child-supertag';
  }

  const semanticContext = { document: context.document, path };

  for (const semantic of getNodeSemanticTypes(node, semanticContext)) {
    const issue = NodeIntegrityValidators[semantic]?.(node, path, context);

    if (issue) return issue;
  }
}

/** Repairs one exceptional semantic invariant failure with Plate transforms. */
export function repairNode(
  editor: PlateEditor,
  entry: TanaNodeEntry,
  context: TanaNodeIntegrityContext
): boolean {
  const [node, path] = entry;
  const issue = validateNode(node, path, context);

  if (!issue) return false;

  switch (issue) {
    case 'invalid-supertag-definition':
      editor.tf.setNodes({ tanaSupertagDefinition: {} }, { at: path });
      return true;
    case 'invalid-supertag-inheritance': {
      const candidateParents = node.tanaSupertagDefinition?.extends ?? [];
      const safeParents = candidateParents.filter(
        (parentId): parentId is NodeId =>
          typeof parentId === 'string' &&
          parentId !== node.id &&
          context.supertagDefinitionIds.has(parentId) &&
          typeof node.id === 'string' &&
          !supertagParentReaches(parentId, node.id, context)
      );

      const definition = { ...node.tanaSupertagDefinition };

      if (safeParents.length > 0) {
        definition.extends = safeParents;
      } else {
        delete definition.extends;
      }

      editor.tf.setNodes({ tanaSupertagDefinition: definition }, { at: path });
      return true;
    }
    case 'invalid-value-owner':
      editor.tf.unsetNodes('tanaFieldValueType', { at: path });
      return true;
    case 'field-definition-field-conflict':
    case 'invalid-field-host':
      editor.tf.unsetNodes('tanaFieldId', { at: path });
      return true;
    case 'missing-from-supertag-source':
      editor.tf.setNodes(
        {
          tanaFieldDefinition: {
            ...node.tanaFieldDefinition,
            sourceSupertagId: null,
          },
        },
        { at: path }
      );
      return true;
    case 'missing-supertag-membership': {
      const supertagIds = (node.tanaSupertagIds ?? []).filter((supertagId) =>
        context.supertagDefinitionIds.has(supertagId)
      );

      if (supertagIds.length === 0) {
        editor.tf.unsetNodes('tanaSupertagIds', { at: path });
      } else {
        editor.tf.setNodes({ tanaSupertagIds: supertagIds }, { at: path });
      }
      return true;
    }
    case 'missing-default-child-supertag': {
      if (node.tanaDefaultChildSupertagId !== undefined) {
        editor.tf.unsetNodes('tanaDefaultChildSupertagId', { at: path });
      } else {
        const definition = { ...node.tanaSupertagDefinition };

        delete definition.defaultChildSupertagId;
        editor.tf.setNodes({ tanaSupertagDefinition: definition }, { at: path });
      }
      return true;
    }
    case 'invalid-view-definition':
      editor.tf.setNodes({ tanaViewDefinition: { type: 'outline' } }, { at: path });
      return true;
    case 'invalid-search-query': {
      const query = pruneTanaQueryExpression(
        node.tanaSearchDefinition?.query,
        context
      ) ?? { children: [], type: 'and' };

      editor.tf.setNodes(
        {
          tanaSearchDefinition: {
            query,
          },
        },
        { at: path }
      );
      return true;
    }
  }
}

/** The sole integrity router for current Node semantics. */
export const NodeIntegrity = { repairNode, validateNode };

/**
 * Conservative workspace-skeleton fallback: a mis-indented system Node is
 * restored as a Workspace direct child. It never creates missing system
 * Nodes, never deduplicates, and never reorders — deletion stays blocked at
 * the interaction boundary and persistence stays the final gate.
 */
function repairWorkspaceHierarchy(editor: PlateEditor, entries: readonly TanaNodeEntry[]): boolean {
  const workspaceEntries = entries.filter(([node]) => node.tanaSystemNode === 'workspace');

  if (workspaceEntries.length !== 1) return false;

  const [workspace, workspacePath] = workspaceEntries[0];
  const workspaceIndent = typeof workspace.indent === 'number' ? workspace.indent : 0;

  if (workspaceIndent !== 0) {
    editor.tf.setNodes({ indent: 0 }, { at: workspacePath });
    return true;
  }

  const counts = new Map<string, number>();

  for (const [node] of entries) {
    if (node.tanaSystemNode === undefined) continue;
    counts.set(node.tanaSystemNode, (counts.get(node.tanaSystemNode) ?? 0) + 1);
  }

  // Duplicates or missing system Nodes are persistence errors, not repairs.
  // Integrity must not become a Workspace manager.
  if (
    counts.get('workspace') !== 1 ||
    counts.get('home') !== 1 ||
    counts.get('daily-notes') !== 1 ||
    counts.get('schema') !== 1 ||
    counts.get('library') !== 1 ||
    counts.get('settings') !== 1 ||
    counts.get('trash') !== 1
  ) {
    return false;
  }

  const expectedIndent = workspaceIndent + 1;

  for (const [node, path] of entries) {
    if (
      node.tanaSystemNode === undefined ||
      node.tanaSystemNode === 'workspace'
    ) {
      continue;
    }

    const indent = typeof node.indent === 'number' ? node.indent : 0;

    if (indent !== expectedIndent) {
      editor.tf.setNodes({ indent: expectedIndent }, { at: path });
      return true;
    }
  }

  return false;
}

/**
 * Repairs one dangling semantic relation at a time. Returning after a repair
 * lets Plate's native normalization schedule the next pass with fresh paths.
 */
function normalizeRelations(editor: PlateEditor): boolean {
  const entries = getTanaNodeEntries(editor);
  const nodeIds = getNodeIds(entries);
  const fieldDefinitions = getFieldDefinitions(entries, editor.children);
  const context: TanaNodeIntegrityContext = {
    document: editor.children,
    entries,
    fieldDefinitions,
    fieldDefinitionIds: getSemanticNodeIds(
      entries,
      editor.children,
      'field-definition'
    ),
    nodeIds,
    supertagDefinitionIds: getSemanticNodeIds(
      entries,
      editor.children,
      'supertag-definition'
    ),
  };
  const danglingInlinePath = findDanglingNonReferenceInlineRelation(
    entries,
    editor.children,
    nodeIds
  );

  if (danglingInlinePath) {
    editor.tf.removeNodes({ at: danglingInlinePath });
    return true;
  }

  if (repairWorkspaceHierarchy(editor, entries)) return true;

  for (const [node, path] of entries) {
    if (repairNode(editor, [node, path], context)) return true;
  }

  for (const [node, path] of entries) {
    if (pruneHiddenFieldNodeIds(editor, node, path, nodeIds)) return true;
  }

  return false;
}

/** Keeps semantic NodeId relations valid after Plate has edited the document. */
export const TanaIntegrityPlugin = createPlatePlugin({
  key: TANA_INTEGRITY_PLUGIN_KEY,
}).overrideEditor(({ editor, tf: { normalizeNode } }) => ({
  transforms: {
    normalizeNode(entry) {
      if (entry[1].length === 0 && normalizeRelations(editor)) return;

      normalizeNode(entry);
    },
  },
}));
