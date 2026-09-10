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
      ["child", "target"],
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
    assert.deepEqual(index.nodesById.get("search")!.searchDefinition!.query, {
      children: [{ predicate: { kind: "text-contains", text: "target" }, type: "predicate" }],
      type: "and",
    });
    assert.equal(
      search.setQuery("search", {
        predicate: { kind: "references", nodeId: "missing" },
        type: "predicate",
      }),
      true,
    );
    index = buildTanaIndex(editor.children);
    assert.deepEqual(
      runTanaQuery(index, index.nodesById.get("search")!.searchDefinition!.query),
      [],
    );
  });
});

test('a blank ordinary Node turns into a Search when ? is typed', () => {
  const editor = createEditor([
    { children: [{ text: "" }], id: "search", type: KEYS.p },
  ]);
  editor.tf.select({ path: [0, 0], offset: 0 });
  editor.tf.insertText("?");

  assert.deepEqual(editor.children[0].tanaSearchDefinition, {
    query: { children: [], type: "and" },
  });
  assert.equal(editor.children[0].children[0]?.text, "");
});

test('Search writer shares canonical-host policy with persistence and integrity', () => {
  const editor = createEditor([
    { children: [{ text: 'Ordinary' }], id: 'ordinary', type: KEYS.p },
    { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'outline' }, type: KEYS.p },
    { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    { children: [{ text: 'Field definition' }], id: 'definition', tanaFieldDefinition: { type: 'options' }, type: KEYS.p },
    { children: [{ text: 'Option' }], id: 'option', indent: 1, type: KEYS.p },
    { children: [{ text: 'Tag' }], id: 'tag', tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', tanaSystemNode: 'home', type: KEYS.p },
  ]);
  const search = editor.getTransforms(TanaSearchPlugin).search;

  assert.equal(search.define('ordinary'), true);
  assert.equal(search.define('view'), true);
  ['reference', 'definition', 'option', 'tag', 'home'].forEach((nodeId) => {
    assert.equal(search.define(nodeId), false);
  });
});

test('Add result creates one canonical Daily child and only reports a match after derived re-evaluation', () => {
  const editor = createEditor([
    { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
    {
      children: [{ text: 'Matching search' }],
      id: 'matching-search',
      indent: 2,
      tanaSearchDefinition: {
        query: {
          children: [
            { predicate: { kind: 'has-supertag', supertagId: 'project' }, type: 'predicate' },
            {
              predicate: {
                fieldId: 'status',
                kind: 'field-equals',
                value: { type: 'plain', value: 'ready' },
              },
              type: 'predicate',
            },
            { predicate: { kind: 'done-state', state: 'todo' }, type: 'predicate' },
            { predicate: { date: '2026-05-01', kind: 'date-is' }, type: 'predicate' },
          ],
          type: 'and',
        },
      },
      type: KEYS.p,
    },
    {
      children: [{ text: 'Mismatching search' }],
      id: 'mismatching-search',
      indent: 2,
      tanaSearchDefinition: {
        query: {
          children: [
            { predicate: { date: '2026-05-01', kind: 'date-is' }, type: 'predicate' },
            { predicate: { kind: 'text-contains', text: 'cannot-materialize' }, type: 'predicate' },
          ],
          type: 'and',
        },
      },
      type: KEYS.p,
    },
    { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
    { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'Status' }], id: 'status', indent: 2, tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  ]);
  const before = structuredClone(editor.children);
  const search = editor.getTransforms(TanaSearchPlugin).search;
  const matched = search.addResult('matching-search');

  assert.ok(matched);
  assert.equal(matched.matches, true);
  const index = buildTanaIndex(editor.children);
  const created = index.nodesById.get(matched.nodeId);
  assert.equal(index.parentNodeIds.get(matched.nodeId), matched.dayNodeId);
  assert.equal(created?.doneState, 'todo');
  assert.deepEqual(created?.supertagIds, ['project']);
  assert.deepEqual(index.fieldNodesByParent.get(matched.nodeId)?.[0]?.values, [
    { type: 'plain', value: 'ready' },
  ]);
  assert.equal(
    runTanaQuery(
      index,
      index.nodesById.get('matching-search')!.searchDefinition!.query,
    ).some((node) => node.id === matched.nodeId),
    true,
  );

  const afterMatch = structuredClone(editor.children);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, afterMatch);

  const mismatched = search.addResult('mismatching-search');
  assert.ok(mismatched);
  assert.equal(mismatched.matches, false);
  assert.equal(buildTanaIndex(editor.children).nodesById.get(mismatched.nodeId)?.text, '');
});
