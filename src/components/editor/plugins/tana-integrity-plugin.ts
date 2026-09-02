import { ElementApi } from 'platejs';
import type { Path, TElement, Value } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaParentPath,
} from '@/lib/tana/outliner';
import {
  getNodeSemanticType,
  getNodeSemanticTypes,
  hasNodeSemantic,
  type TanaNodeSemanticType,
} from '@/lib/tana/node-semantic';
import type {
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaQueryClause,
} from '@/lib/tana/types';

export const TANA_INTEGRITY_PLUGIN_KEY = 'tanaIntegrity' as const;

/**
 * NodeId relations currently owned by integrity:
 *
 * inline
 * - mention.key
 * - supertag.key
 *
 * field
 * - Field Definition Node identity
 * - field occurrence.tanaFieldId
 * - value child.tanaFieldValueType
 * - presentation.hiddenFieldNodeIds
 * - from-supertag.sourceSupertagId
 * - value-node mention.key
 *
 * view
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
  | 'duplicate-value-child'
  | 'field-definition-field-conflict'
  | 'invalid-field-host'
  | 'invalid-supertag-definition'
  | 'invalid-value-owner'
  | 'missing-field-definition'
  | 'missing-value-child'
  | 'missing-from-supertag-source'
  | 'invalid-view-query';

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

function findDanglingInlineRelation(
  entries: readonly TanaNodeEntry[],
  nodeIds: ReadonlySet<NodeId>
): Path | undefined {
  function visit(node: TElement, path: Path): Path | undefined {
    const targetNodeId = (node as RelationElement).key;

    if (
      getNodeSemanticType(node) === 'reference' &&
      typeof targetNodeId === 'string' &&
      !nodeIds.has(targetNodeId)
    ) {
      return path;
    }

    for (const [index, child] of node.children.entries()) {
      if (!ElementApi.isElement(child)) continue;

      const dangling = visit(child, [...path, index]);

      if (dangling) return dangling;
    }
  }

  for (const [node, path] of entries) {
    const dangling = visit(node, path);

    if (dangling) return dangling;
  }
}

function isReferenceLikeFieldValue(
  value: FieldValue | undefined
): value is Extract<FieldValue, { type: 'from-supertag' | 'options' }> {
  return value?.type === 'from-supertag' || value?.type === 'options';
}

function removeNodeSubtree(editor: PlateEditor, path: Path) {
  getTanaNodeDescendantPaths(editor.children, path)
    .reverse()
    .forEach((descendantPath) => editor.tf.removeNodes({ at: descendantPath }));
  editor.tf.removeNodes({ at: path });
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

function isTanaQueryClauseValid(
  clause: TanaQueryClause,
  context: Pick<
    TanaNodeIntegrityContext,
    'fieldDefinitionIds' | 'nodeIds' | 'supertagDefinitionIds'
  >
): boolean {
  switch (clause.kind) {
    case 'field-defined':
    case 'field-exists':
      return context.fieldDefinitionIds.has(clause.fieldId);
    case 'field-equals':
      return (
        context.fieldDefinitionIds.has(clause.fieldId) &&
        (!isReferenceLikeFieldValue(clause.value) ||
          context.nodeIds.has(clause.value.value))
      );
    case 'has-supertag':
      return context.supertagDefinitionIds.has(clause.supertagId);
    case 'text-contains':
      return true;
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

function isFieldHost(node: TanaBlockElement | undefined) {
  return (
    !!node &&
    node.tanaFieldDefinition === undefined &&
    node.tanaFieldId === undefined &&
    node.tanaFieldValueType === undefined
  );
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
  'supertag-definition': (node) => {
    const definition = node.tanaSupertagDefinition;

    return typeof definition !== 'object' || definition === null || Array.isArray(definition)
      ? 'invalid-supertag-definition'
      : undefined;
  },
  field: (node, path, context) => {
    if (node.tanaFieldDefinition) return 'field-definition-field-conflict';

    const fieldId = node.tanaFieldId;
    const definition = fieldId ? context.fieldDefinitions.get(fieldId) : undefined;

    if (!definition) return 'missing-field-definition';

    const parentPath = getTanaParentPath(context.document, path);
    const parent = parentPath ? getEntryAtPath(context.entries, parentPath) : undefined;

    if (!isFieldHost(parent)) return 'invalid-field-host';

    const valuePaths = getTanaDirectChildPaths(context.document, path).filter(
      (childPath) => {
        const child = getEntryAtPath(context.entries, childPath);

        return !!child && hasNodeSemantic(child, 'value', {
          document: context.document,
          path: childPath,
        });
      }
    );

    if (valuePaths.length === 0) return 'missing-value-child';
    if (valuePaths.length > 1) return 'duplicate-value-child';
  },
  value: (node, path, context) => {
    const parentPath = getTanaParentPath(context.document, path);
    const parent = parentPath ? getEntryAtPath(context.entries, parentPath) : undefined;
    const definition = parent?.tanaFieldId
      ? context.fieldDefinitions.get(parent.tanaFieldId)
      : undefined;

    if (!definition || node.tanaFieldValueType !== definition.type) {
      return 'invalid-value-owner';
    }
  },
  view: (node, _, context) => {
    const clauses = node.tanaViewDefinition?.clauses;

    if (!Array.isArray(clauses)) return 'invalid-view-query';

    return clauses.some((clause) => !isTanaQueryClauseValid(clause, context))
      ? 'invalid-view-query'
      : undefined;
  },
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
    case 'invalid-value-owner':
      editor.tf.unsetNodes('tanaFieldValueType', { at: path });
      return true;
    case 'field-definition-field-conflict':
    case 'invalid-field-host':
      editor.tf.unsetNodes('tanaFieldId', { at: path });
      return true;
    case 'missing-field-definition':
      removeNodeSubtree(editor, path);
      return true;
    case 'duplicate-value-child': {
      const duplicatePath = getTanaDirectChildPaths(editor.children, path)
        .filter((childPath) => {
          const child = getEntryAtPath(context.entries, childPath);

          return !!child && hasNodeSemantic(child, 'value', {
            document: editor.children,
            path: childPath,
          });
        })
        .at(1);

      if (!duplicatePath) return false;

      editor.tf.unsetNodes('tanaFieldValueType', { at: duplicatePath });
      return true;
    }
    case 'missing-value-child': {
      const fieldId = node.tanaFieldId;
      const definition = fieldId ? context.fieldDefinitions.get(fieldId) : undefined;

      if (!definition) return false;

      const indent = typeof node.indent === 'number' ? node.indent + 1 : 1;

      editor.tf.insertNodes(
        editor.api.create.block({
          children: [{ text: '' }],
          indent,
          tanaFieldValueType: definition.type,
        }),
        { at: [path[0] + 1] }
      );
      return true;
    }
    case 'missing-from-supertag-source':
      editor.tf.setNodes(
        {
          tanaFieldDefinition: {
            sourceSupertagId: null,
            type: 'from-supertag',
          },
        },
        { at: path }
      );
      return true;
    case 'invalid-view-query': {
      const clauses = Array.isArray(node.tanaViewDefinition?.clauses)
        ? node.tanaViewDefinition.clauses
        : [];

      editor.tf.setNodes(
        {
          tanaViewDefinition: {
            clauses: clauses.filter((clause) =>
              isTanaQueryClauseValid(clause, context)
            ),
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
  const danglingInlinePath = findDanglingInlineRelation(entries, nodeIds);

  if (danglingInlinePath) {
    editor.tf.removeNodes({ at: danglingInlinePath });
    return true;
  }

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
