import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import { hasNodeSemantic } from '@/lib/tana/node-semantic';
import { buildTanaIndex } from '@/lib/tana/index';
import { isTanaQueryClauseValid } from '@/lib/tana/query';
import type { NodeId, TanaBlockElement, TanaQueryClause } from '@/lib/tana/types';

export const TANA_VIEW_PLUGIN_KEY = 'tanaView' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function define(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry ||
    hasNodeSemantic(entry[0], 'view', {
      document: editor.children,
      path: entry[1],
    })
  ) {
    return false;
  }

  editor.tf.setNodes({ tanaViewDefinition: { clauses: [] } }, { at: entry[1] });

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry ||
    !hasNodeSemantic(entry[0], 'view', {
      document: editor.children,
      path: entry[1],
    })
  ) {
    return false;
  }

  editor.tf.unsetNodes('tanaViewDefinition', { at: entry[1] });

  return true;
}

function addClause(
  editor: PlateEditor,
  nodeId: NodeId,
  clause: TanaQueryClause
) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const definition = entry?.[0].tanaViewDefinition;

  if (!entry || !definition) return false;
  if (!isTanaQueryClauseValid(buildTanaIndex(editor.children), clause)) {
    return false;
  }

  editor.tf.setNodes(
    { tanaViewDefinition: { clauses: [...definition.clauses, clause] } },
    { at: entry[1] }
  );

  return true;
}

function removeClause(editor: PlateEditor, nodeId: NodeId, index: number) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const definition = entry?.[0].tanaViewDefinition;

  if (
    !entry ||
    !definition ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= definition.clauses.length
  ) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaViewDefinition: {
        clauses: definition.clauses.filter((_, clauseIndex) => clauseIndex !== index),
      },
    },
    { at: entry[1] }
  );

  return true;
}

/** Owns all document mutations for a View Node's saved v1 Query. */
export const TanaViewPlugin = createPlatePlugin({
  key: TANA_VIEW_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  view: {
    addClause: (nodeId: NodeId, clause: TanaQueryClause) =>
      addClause(editor, nodeId, clause),
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId) => remove(editor, nodeId),
    removeClause: (nodeId: NodeId, index: number) =>
      removeClause(editor, nodeId, index),
  },
}));
