import { ElementApi, KEYS } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana/constants';
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaParentPath,
} from '@/lib/tana/outliner';
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
 * - options.options[]
 * - from-supertag.sourceSupertagId
 * - value-node mention.key
 *
 * view
 * - query fieldId
 * - query supertagId
 * - query reference-like FieldValue.value
 */
type TanaNodeEntry = [TanaBlockElement, Path];
type RelationElement = TElement & { key?: unknown };

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
      (node.type === KEYS.mention || node.type === TANA_SUPERTAG_KEY) &&
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
  nodeIds: ReadonlySet<NodeId>
): boolean {
  switch (clause.kind) {
    case 'field-defined':
    case 'field-exists':
      return nodeIds.has(clause.fieldId);
    case 'field-equals':
      return (
        nodeIds.has(clause.fieldId) &&
        (!isReferenceLikeFieldValue(clause.value) ||
          nodeIds.has(clause.value.value))
      );
    case 'has-supertag':
      return nodeIds.has(clause.supertagId);
    case 'text-contains':
      return true;
  }
}

function getFieldDefinitions(entries: readonly TanaNodeEntry[]) {
  return new Map(
    entries.flatMap(([node]) =>
      typeof node.id === 'string' && node.tanaFieldDefinition
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

function normalizeFieldValueNodes(
  editor: PlateEditor,
  entries: readonly TanaNodeEntry[],
  fieldDefinitions: ReadonlyMap<NodeId, NonNullable<TanaBlockElement['tanaFieldDefinition']>>
) {
  for (const [node, path] of entries) {
    if (!node.tanaFieldValueType) continue;

    const parentPath = getTanaParentPath(editor.children, path);
    const parent = parentPath ? getEntryAtPath(entries, parentPath) : undefined;
    const definition = parent?.tanaFieldId
      ? fieldDefinitions.get(parent.tanaFieldId)
      : undefined;

    if (!definition || node.tanaFieldValueType !== definition.type) {
      editor.tf.unsetNodes('tanaFieldValueType', { at: path });
      return true;
    }
  }

  return false;
}

function normalizeFieldOccurrences(
  editor: PlateEditor,
  entries: readonly TanaNodeEntry[],
  fieldDefinitions: ReadonlyMap<NodeId, NonNullable<TanaBlockElement['tanaFieldDefinition']>>
) {
  for (const [node, path] of entries) {
    if (!node.tanaFieldId) continue;

    if (node.tanaFieldDefinition) {
      editor.tf.unsetNodes('tanaFieldId', { at: path });
      return true;
    }

    const definition = fieldDefinitions.get(node.tanaFieldId);

    const parentPath = getTanaParentPath(editor.children, path);
    const parent = parentPath ? getEntryAtPath(entries, parentPath) : undefined;

    if (!definition) {
      removeNodeSubtree(editor, path);
      return true;
    }

    if (!isFieldHost(parent)) {
      editor.tf.unsetNodes('tanaFieldId', { at: path });
      return true;
    }

    const valuePaths = getTanaDirectChildPaths(editor.children, path).filter(
      (childPath) =>
        getEntryAtPath(entries, childPath)?.tanaFieldValueType === definition.type
    );

    if (valuePaths.length > 1) {
      editor.tf.unsetNodes('tanaFieldValueType', { at: valuePaths[1] });
      return true;
    }

    if (valuePaths.length === 0) {
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
  const fieldDefinitions = getFieldDefinitions(entries);
  const danglingInlinePath = findDanglingInlineRelation(entries, nodeIds);

  if (danglingInlinePath) {
    editor.tf.removeNodes({ at: danglingInlinePath });
    return true;
  }

  if (normalizeFieldValueNodes(editor, entries, fieldDefinitions)) return true;
  if (normalizeFieldOccurrences(editor, entries, fieldDefinitions)) return true;

  for (const [node, path] of entries) {
    const definition = node.tanaFieldDefinition;

    if (definition?.type === 'from-supertag') {
      if (
        definition.sourceSupertagId !== null &&
        !nodeIds.has(definition.sourceSupertagId)
      ) {
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
      }

      continue;
    }

    if (definition?.type !== 'options') continue;

    const options = definition.options.filter((optionId) => nodeIds.has(optionId));

    if (options.length !== definition.options.length) {
      editor.tf.setNodes(
        { tanaFieldDefinition: { options, type: 'options' } },
        { at: path }
      );
      return true;
    }
  }

  for (const [node, path] of entries) {
    if (pruneHiddenFieldNodeIds(editor, node, path, nodeIds)) return true;
  }

  for (const [node, path] of entries) {
    const definition = node.tanaViewDefinition;

    if (!definition) continue;

    const clauses = definition.clauses.filter((clause) =>
      isTanaQueryClauseValid(clause, nodeIds)
    );

    if (clauses.length !== definition.clauses.length) {
      editor.tf.setNodes({ tanaViewDefinition: { clauses } }, { at: path });
      return true;
    }
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
