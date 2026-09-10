import { ElementApi, NodeApi } from "platejs";
import type { NodeEntry } from "platejs";
import { createPlatePlugin, type PlateEditor } from "platejs/react";

import { isTanaNodeElement } from "@/lib/tana/constants";
import { buildTanaIndex } from "@/lib/tana/index";
import {
  createAndQuery,
  normalizeTanaQueryRoot,
  runTanaQuery,
} from "@/lib/tana/query";
import { isTanaQueryAst, isTanaQueryPredicateAst } from "@/lib/tana/query-ast";
import { isTanaSearchHost } from "@/lib/tana/search-host";
import { getTanaToday, isTanaDay } from "@/lib/tana/time";
import { getTanaNodeDescendantPaths } from "@/lib/tana/outliner";
import type {
  NodeId,
  TanaBlockElement,
  TanaQueryClause,
  TanaQueryExpression,
  TanaQueryPredicate,
} from "@/lib/tana/types";

import { TanaFieldPlugin } from "./tana-field-plugin";
import { TanaNodeIdentityPlugin } from "./tana-node-identity-plugin";
import { TanaSupertagPlugin } from "./tana-supertag-plugin";
import { TanaTimePlugin } from "./tana-time-plugin";
import { TanaZoomPlugin } from "./tana-zoom-plugin";

export const TANA_SEARCH_PLUGIN_KEY = "tanaSearch" as const;

/** A real Daily child is created even when a dynamic Search cannot match it. */
export type TanaSearchAddResultOutcome = {
  day: string;
  dayNodeId: NodeId;
  matches: boolean;
  nodeId: NodeId;
};

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
    entry[0].tanaSearchDefinition ||
    !isTanaSearchHost(entry[0], { document: editor.children, path: entry[1] })
  )
    return false;

  editor.tf.setNodes(
    { tanaSearchDefinition: { query: createAndQuery() } },
    { at: entry[1] },
  );

  return true;
}

function remove(editor: PlateEditor, nodeId: NodeId) {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (
    !entry?.[0].tanaSearchDefinition ||
    !isTanaSearchHost(entry[0], { document: editor.children, path: entry[1] })
  )
    return false;

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

  if (
    !entry ||
    !definition ||
    !isTanaSearchHost(entry[0], { document: editor.children, path: entry[1] })
  )
    return false;
  if (!isTanaQueryAst(query)) return false;
  const normalizedQuery = normalizeTanaQueryRoot(query);

  editor.tf.setNodes(
    {
      tanaSearchDefinition: {
        ...definition,
        query: normalizedQuery,
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

  if (
    !entry ||
    !definition ||
    !isTanaSearchHost(entry[0], { document: editor.children, path: entry[1] })
  )
    return false;
  if (definition.query.type !== "and") return false;
  if (!isTanaQueryPredicateAst(clause)) return false;

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
    !isTanaSearchHost(entry[0], {
      document: editor.children,
      path: entry[1],
    }) ||
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

/**
 * A positive date predicate can choose the matching Daily page.  OR/NOT are
 * deliberately not guessed: their result is still measured from the derived
 * index after the real Node is written.
 */
function getSearchResultDay(query: TanaQueryExpression): string {
  const dates = new Set<string>();
  const visit = (expression: TanaQueryExpression) => {
    if (expression.type === "and") {
      expression.children.forEach(visit);
      return;
    }
    if (expression.type === "predicate" && expression.predicate.kind === "date-is") {
      dates.add(expression.predicate.date);
    }
  };

  visit(query);
  return dates.size === 1 ? [...dates][0]! : getTanaToday();
}

/** Only conjunctive predicates can be materialized without inventing truth. */
function getMaterializablePredicates(
  expression: TanaQueryExpression,
): readonly TanaQueryPredicate[] {
  if (expression.type === "predicate") return [expression.predicate];
  if (expression.type !== "and") return [];

  return expression.children.flatMap(getMaterializablePredicates);
}

function materializeSearchPredicate(
  editor: PlateEditor,
  nodeId: NodeId,
  predicate: TanaQueryPredicate,
) {
  const fields = editor.getTransforms(TanaFieldPlugin).field;
  const supertags = editor.getTransforms(TanaSupertagPlugin).supertag;

  switch (predicate.kind) {
    case "has-supertag":
    case "has-tag":
      supertags.apply(nodeId, predicate.supertagId);
      return;
    case "field-defined":
    case "has-field":
      fields.materialize(nodeId, predicate.fieldId);
      return;
    case "field-equals":
      if (fields.materialize(nodeId, predicate.fieldId)) {
        fields.setValue(nodeId, predicate.fieldId, predicate.value);
      }
      return;
    case "done-state": {
      const entry = getTanaNodeEntry(editor, nodeId);

      if (entry && entry[0].tanaDoneState !== predicate.state) {
        editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity
          .setDoneState(nodeId, predicate.state);
      }
      return;
    }
    // A Node below the chosen Day makes `date-is` true through the derived
    // parent context. Comparisons, graph predicates, regex/text, semantics,
    // and NOT/OR branches are never fabricated.
    case "date-is":
    case "field-exists":
    case "field-greater-than":
    case "field-less-than":
    case "text-contains":
    case "text-matches-regex":
    case "is-semantic":
    case "child-of":
    case "descendant-of":
    case "grandchild-of":
    case "references":
    case "referenced-by":
      return;
  }
}

/**
 * Creates one canonical blank Node below a real Daily page, then writes only
 * conditions whose document representation is unambiguous. The final match
 * is always re-evaluated from TanaIndex rather than assumed from this intent.
 */
function addResult(
  editor: PlateEditor,
  searchNodeId: NodeId,
): TanaSearchAddResultOutcome | undefined {
  const searchEntry = getTanaNodeEntry(editor, searchNodeId);
  const definition = searchEntry?.[0].tanaSearchDefinition;

  if (
    !searchEntry ||
    !definition ||
    !isTanaSearchHost(searchEntry[0], {
      document: editor.children,
      path: searchEntry[1],
    }) ||
    !isTanaQueryAst(definition.query)
  ) {
    return;
  }

  const day = getSearchResultDay(definition.query);
  if (!isTanaDay(day)) return;

  let outcome: TanaSearchAddResultOutcome | undefined;

  editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
    const dayNodeId = editor.getTransforms(TanaTimePlugin).time.goToDay(day);
    const dayEntry = dayNodeId ? getTanaNodeEntry(editor, dayNodeId) : undefined;

    if (!dayEntry) return;

    const [dayNode, dayPath] = dayEntry;
    const resolvedDayNodeId = typeof dayNode.id === "string" ? dayNode.id : undefined;
    if (!resolvedDayNodeId) return;
    const indent = typeof dayNode.indent === "number" ? dayNode.indent + 1 : 1;
    const insertionPath = [
      (getTanaNodeDescendantPaths(editor.children, dayPath).at(-1)?.[0] ?? dayPath[0]) + 1,
    ];

    editor.tf.insertNodes(
      editor.api.create.block({ children: [{ text: "" }], indent }),
      { at: insertionPath },
    );

    const created = editor.api.node(insertionPath);
    const nodeId = created && ElementApi.isElement(created[0]) && typeof created[0].id === "string"
      ? created[0].id
      : undefined;

    if (!nodeId) return;

    // The newly-created Daily child becomes the active Plate surface before
    // any semantic writer runs, so the existing Done transform keeps its
    // normal interactability boundary as well as its checkbox adapter.
    editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);

    getMaterializablePredicates(definition.query).forEach((predicate) =>
      materializeSearchPredicate(editor, nodeId, predicate),
    );

    const index = buildTanaIndex(editor.children);
    outcome = {
      day,
      dayNodeId: resolvedDayNodeId,
      matches: runTanaQuery(index, definition.query, { excludeNodeId: searchNodeId })
        .some((node) => node.id === nodeId),
      nodeId,
    };
  }));

  return outcome;
}

/** Owns document mutations for a Search Node's result-set definition. */
export const TanaSearchPlugin = createPlatePlugin({
  key: TANA_SEARCH_PLUGIN_KEY,
})
  .extendEditorTransforms(({ editor }) => ({
  search: {
    addResult: (nodeId: NodeId) => addResult(editor, nodeId),
    addClause: (nodeId: NodeId, clause: TanaQueryClause) =>
      addClause(editor, nodeId, clause),
    define: (nodeId: NodeId) => define(editor, nodeId),
    remove: (nodeId: NodeId) => remove(editor, nodeId),
    removeClause: (nodeId: NodeId, index: number) =>
      removeClause(editor, nodeId, index),
    setQuery: (nodeId: NodeId, query: TanaQueryExpression) =>
      setQuery(editor, nodeId, query),
  },
}))
  .overrideEditor(({ editor, tf: { insertText } }) => ({
    transforms: {
      insertText(text, options) {
        if (text === "?") {
          const entry = editor.api.block();
          if (
            entry &&
            ElementApi.isElement(entry[0]) &&
            isTanaNodeElement(entry) &&
            NodeApi.string(entry[0]) === "" &&
            typeof entry[0].id === "string" &&
            isTanaSearchHost(entry[0] as TanaBlockElement, {
              document: editor.children,
              path: entry[1],
            }) &&
            define(editor, entry[0].id)
          ) {
            return;
          }
        }
        return insertText(text, options);
      },
    },
  }));
