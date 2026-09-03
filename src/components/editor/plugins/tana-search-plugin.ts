import { ElementApi } from "platejs";
import type { NodeEntry } from "platejs";
import { createPlatePlugin, type PlateEditor } from "platejs/react";

import { isTanaNodeElement } from "@/lib/tana/constants";
import { buildTanaIndex } from "@/lib/tana/index";
import {
  createAndQuery,
  isTanaQueryClauseValid,
  isTanaQueryExpressionValid,
} from "@/lib/tana/query";
import type {
  NodeId,
  TanaBlockElement,
  TanaQueryClause,
  TanaQueryExpression,
} from "@/lib/tana/types";

export const TANA_SEARCH_PLUGIN_KEY = "tanaSearch" as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0])) return;

  return isTanaNodeElement(entry)
    ? (entry as NodeEntry<TanaBlockElement>)
    : undefined;
}

function define(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry || entry[0].tanaSearchDefinition) return false;

  editor.tf.setNodes(
    { tanaSearchDefinition: { query: createAndQuery() } },
    { at: entry[1] },
  );

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry?.[0].tanaSearchDefinition) return false;

  editor.tf.unsetNodes("tanaSearchDefinition", { at: entry[1] });

  return true;
}

/** Writes one already-validated persisted AST; query results stay derived. */
function setQuery(
  editor: PlateEditor,
  nodeId: NodeId,
  query: TanaQueryExpression,
): boolean {
  const entry = getTanaNodeEntry(editor, nodeId);
  const definition = entry?.[0].tanaSearchDefinition;

  if (!entry || !definition) return false;
  if (!isTanaQueryExpressionValid(buildTanaIndex(editor.children), query))
    return false;

  editor.tf.setNodes(
    {
      tanaSearchDefinition: {
        ...definition,
        query,
      },
    },
    { at: entry[1] },
  );

  return true;
}

function addClause(
  editor: PlateEditor,
  nodeId: NodeId,
  clause: TanaQueryClause,
) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const definition = entry?.[0].tanaSearchDefinition;

  if (!entry || !definition) return false;
  if (definition.query.type !== "and") return false;
  if (!isTanaQueryClauseValid(buildTanaIndex(editor.children), clause))
    return false;

  editor.tf.setNodes(
    {
      tanaSearchDefinition: {
        query: {
          ...definition.query,
          children: [
            ...definition.query.children,
            { predicate: clause, type: "predicate" },
          ],
        },
      },
    },
    { at: entry[1] },
  );

  return true;
}

function removeClause(editor: PlateEditor, nodeId: NodeId, index: number) {
  const entry = getTanaNodeEntry(editor, nodeId);
  const definition = entry?.[0].tanaSearchDefinition;

  if (
    !entry ||
    !definition ||
    !Number.isInteger(index) ||
    index < 0 ||
    definition.query.type !== "and" ||
    index >= definition.query.children.length
  ) {
    return false;
  }

  editor.tf.setNodes(
    {
      tanaSearchDefinition: {
        query: {
          ...definition.query,
          children: definition.query.children.filter(
            (_, clauseIndex) => clauseIndex !== index,
          ),
        },
      },
    },
    { at: entry[1] },
  );

  return true;
}

/** Owns document mutations for a Search Node's result-set definition. */
export const TanaSearchPlugin = createPlatePlugin({
  key: TANA_SEARCH_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  search: {
    addClause: (nodeId: NodeId, clause: TanaQueryClause) =>
      addClause(editor, nodeId, clause),
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId) => remove(editor, nodeId),
    removeClause: (nodeId: NodeId, index: number) =>
      removeClause(editor, nodeId, index),
    setQuery: (nodeId: NodeId, query: TanaQueryExpression) =>
      setQuery(editor, nodeId, query),
  },
}));
