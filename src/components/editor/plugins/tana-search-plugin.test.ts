import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { KEYS, type Value } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorKit } from "@/components/editor/editor-kit";
import { isTanaNodeElement } from "@/lib/tana/constants";
import { buildTanaIndex } from "@/lib/tana/index";
import { runTanaQuery } from "@/lib/tana/query";

import { TanaSearchPlugin } from "./tana-search-plugin";

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: "always" },
    plugins: EditorKit,
    value,
  });
}

describe("Tana search mutations", () => {
  test("owns a root AND query separately from View presentation", () => {
    const editor = createEditor([
      { children: [{ text: "Open tasks" }], id: "search", type: KEYS.p },
      {
        children: [{ text: "Project" }],
        id: "project",
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
    ]);
    const search = editor.getTransforms(TanaSearchPlugin).search;

    assert.equal(search.define("search"), true);
    assert.equal(
      search.addClause("search", {
        kind: "has-supertag",
        supertagId: "project",
      }),
      true,
    );
    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      query: {
        children: [
          {
            predicate: { kind: "has-supertag", supertagId: "project" },
            type: "predicate",
          },
        ],
        type: "and",
      },
    });
    assert.equal(editor.children[0].tanaViewDefinition, undefined);
  });

  test("writes nested AND/OR/NOT and graph predicates into the canonical Search AST", () => {
    const editor = createEditor([
      { children: [{ text: "Search" }], id: "search", type: KEYS.p },
      { children: [{ text: "Parent" }], id: "parent", type: KEYS.p },
      { children: [{ text: "Child" }], id: "child", indent: 1, type: KEYS.p },
      { children: [{ text: "Target" }], id: "target", type: KEYS.p },
      {
        children: [{ text: "Reference" }],
        id: "reference",
        tanaReferenceTargetId: "target",
        type: KEYS.p,
      },
      { children: [{ text: "Skip this" }], id: "skip", type: KEYS.p },
    ]);
    const search = editor.getTransforms(TanaSearchPlugin).search;

    assert.equal(search.define("search"), true);
    assert.equal(
      search.setQuery("search", {
        children: [
          {
            children: [
              {
                predicate: { kind: "descendant-of", nodeId: "parent" },
                type: "predicate",
              },
              {
                predicate: { kind: "references", nodeId: "target" },
                type: "predicate",
              },
            ],
            type: "or",
          },
          {
            child: {
              predicate: { kind: "text-contains", text: "skip" },
              type: "predicate",
            },
            type: "not",
          },
        ],
        type: "and",
      }),
      true,
    );
    let index = buildTanaIndex(editor.children);

    assert.deepEqual(
      runTanaQuery(
        index,
        index.nodesById.get("search")!.searchDefinition!.query,
      ).map(({ id }) => id),
      ["child", "reference"],
    );

    assert.equal(
      search.setQuery("search", {
        predicate: { kind: "text-contains", text: "target" },
        type: "predicate",
      }),
      true,
    );
    index = buildTanaIndex(editor.children);

    assert.deepEqual(
      runTanaQuery(
        index,
        index.nodesById.get("search")!.searchDefinition!.query,
      ).map(({ id }) => id),
      ["target"],
    );
    assert.equal(
      search.setQuery("search", {
        predicate: { kind: "references", nodeId: "missing" },
        type: "predicate",
      }),
      false,
    );
  });
});
