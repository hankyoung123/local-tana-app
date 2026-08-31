import { ElementApi, KEYS } from 'platejs';
import type { Path, TElement } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  isTanaNodeElement,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana/constants';
import type {
  FieldValueState,
  NodeId,
  TanaBlockElement,
} from '@/lib/tana/types';

export const TANA_INTEGRITY_PLUGIN_KEY = 'tanaIntegrity' as const;

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

function setFieldValues(
  editor: PlateEditor,
  path: Path,
  fieldValues: Readonly<Record<NodeId, FieldValueState>>
) {
  if (Object.keys(fieldValues).length === 0) {
    editor.tf.unsetNodes('tanaFieldValues', { at: path });
  } else {
    editor.tf.setNodes({ tanaFieldValues: fieldValues }, { at: path });
  }
}

/**
 * Repairs one dangling semantic relation at a time. Returning after a repair
 * lets Plate's native normalization schedule the next pass with fresh paths.
 */
function normalizeRelations(editor: PlateEditor): boolean {
  const entries = getTanaNodeEntries(editor);
  const nodeIds = getNodeIds(entries);
  const danglingInlinePath = findDanglingInlineRelation(entries, nodeIds);

  if (danglingInlinePath) {
    editor.tf.removeNodes({ at: danglingInlinePath });
    return true;
  }

  for (const [node, path] of entries) {
    const definition = node.tanaSupertagDefinition;

    if (!definition) continue;

    const fields = definition.fields.filter(({ fieldId }) => nodeIds.has(fieldId));

    if (fields.length !== definition.fields.length) {
      editor.tf.setNodes(
        { tanaSupertagDefinition: { fields } },
        { at: path }
      );
      return true;
    }
  }

  for (const [node, path] of entries) {
    if (!node.tanaFieldValues) continue;

    const fieldValues = Object.fromEntries(
      Object.entries(node.tanaFieldValues).filter(([fieldId]) =>
        nodeIds.has(fieldId)
      )
    ) as Readonly<Record<NodeId, FieldValueState>>;

    if (Object.keys(fieldValues).length !== Object.keys(node.tanaFieldValues).length) {
      setFieldValues(editor, path, fieldValues);
      return true;
    }
  }

  for (const [node, path] of entries) {
    const definition = node.tanaFieldDefinition;

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

  const fieldDefinitions = new Map(
    entries.flatMap(([node]) =>
      typeof node.id === 'string' && node.tanaFieldDefinition
        ? [[node.id, node.tanaFieldDefinition] as const]
        : []
    )
  );

  for (const [node, path] of entries) {
    if (!node.tanaFieldValues) continue;

    for (const [fieldId, value] of Object.entries(node.tanaFieldValues)) {
      const definition = fieldDefinitions.get(fieldId);

      if (
        value !== null &&
        definition?.type === 'options' &&
        value.type === 'options' &&
        !nodeIds.has(value.value)
      ) {
        setFieldValues(editor, path, {
          ...node.tanaFieldValues,
          [fieldId]: null,
        });
        return true;
      }

      if (
        value !== null &&
        definition?.type === 'from-supertag' &&
        value.type === 'from-supertag' &&
        !nodeIds.has(value.value)
      ) {
        setFieldValues(editor, path, {
          ...node.tanaFieldValues,
          [fieldId]: null,
        });
        return true;
      }
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
