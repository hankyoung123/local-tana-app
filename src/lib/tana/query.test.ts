import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Value } from "platejs";
import type { TanaQueryPredicate } from './types';

import { buildTanaIndex } from "./index";
import {
  createAndQuery,
  describeTanaQueryClause,
  describeTanaQueryExpression,
  diagnoseTanaQuery,
  isTanaQueryPredicateValid,
  runTanaQuery,
} from "./query";

const document: Value = [
  {
    id: "project-tag",
    children: [{ text: "Project" }],
    tanaSupertagDefinition: {},
    type: "p",
  },
  {
    id: "estimate",
    children: [{ text: "Estimate" }],
    tanaFieldDefinition: { type: "number" },
    type: "p",
  },
  {
    id: "status",
    children: [{ text: "Status" }],
    tanaFieldDefinition: { type: "options" },
    type: "p",
  },
  { id: "active", children: [{ text: "Active" }], indent: 1, type: "p" },
  { id: "done", children: [{ text: "Done" }], indent: 1, type: "p" },
  {
    id: "alpha",
    children: [
      { text: "Alpha launch " },
      {
        children: [{ text: "" }],
        key: "project-tag",
        type: "tana_supertag",
      },
    ],
    tanaSupertagIds: ["project-tag"],
    type: "p",
  },
  {
    children: [{ text: "" }],
    id: "alpha-estimate",
    indent: 1,
    tanaFieldId: "estimate",
    type: "p",
  },
  {
    children: [{ text: "3" }],
    id: "alpha-estimate-value",
    indent: 2,
    tanaFieldValueType: "number",
    type: "p",
  },
  {
    children: [{ text: "" }],
    id: "alpha-status",
    indent: 1,
    tanaFieldId: "status",
    type: "p",
  },
  {
    children: [{ children: [{ text: "" }], key: "active", type: "mention" }],
    id: "alpha-status-value",
    indent: 2,
    tanaFieldValueType: "options",
    type: "p",
  },
  {
    id: "beta",
    children: [{ text: "Beta notes" }],
    type: "p",
  },
  {
    children: [{ text: "" }],
    id: "beta-status",
    indent: 1,
    tanaFieldId: "status",
    type: "p",
  },
  {
    children: [{ children: [{ text: "" }], key: "done", type: "mention" }],
    id: "beta-status-value",
    indent: 2,
    tanaFieldValueType: "options",
    type: "p",
  },
  {
    id: "gamma",
    children: [{ text: "Gamma notes" }],
    type: "p",
  },
  {
    children: [{ text: "" }],
    id: "gamma-estimate",
    indent: 1,
    tanaFieldId: "estimate",
    type: "p",
  },
  {
    children: [{ text: "" }],
    id: "gamma-estimate-value",
    indent: 2,
    tanaFieldValueType: "number",
    type: "p",
  },
  { children: [{ text: "Parent" }], id: "parent", type: "p" },
  { children: [{ text: "Child" }], id: "child", indent: 1, type: "p" },
  {
    children: [{ text: "Grandchild" }],
    id: "grandchild",
    indent: 2,
    type: "p",
  },
  {
    children: [{ text: "Alpha reference" }],
    id: "alpha-reference",
    tanaReferenceTargetId: "alpha",
    type: "p",
  },
];

const index = buildTanaIndex(document);

function run(clauses: Parameters<typeof createAndQuery>[0]) {
  return runTanaQuery(index, createAndQuery(clauses));
}

describe("runTanaQuery", () => {
  test("supports hasSupertag", () => {
    assert.deepEqual(
      run([{ kind: "has-supertag", supertagId: "project-tag" }]).map(
        ({ id }) => id,
      ),
      ["alpha"],
    );
  });

  test("supports field equals and field exists", () => {
    assert.deepEqual(
      run([
        {
          fieldId: "status",
          kind: "field-equals",
          value: { type: "options", value: "active" },
        },
        { fieldId: "estimate", kind: "field-exists" },
      ]).map(({ id }) => id),
      ["alpha"],
    );
  });

  test("treats a null Field value as not set for field-exists", () => {
    assert.deepEqual(
      run([{ fieldId: "estimate", kind: "field-exists" }]).map(({ id }) => id),
      ["alpha"],
    );
  });

  test("matches a FieldValue for field-exists", () => {
    assert.deepEqual(
      run([{ fieldId: "status", kind: "field-exists" }]).map(({ id }) => id),
      ["alpha", "beta"],
    );
  });

  test("matches any valid Value Node of a list Field", () => {
    const listIndex = buildTanaIndex([
      {
        children: [{ text: "Labels" }],
        id: "labels",
        tanaFieldDefinition: { cardinality: "list", type: "plain" },
        type: "p",
      },
      { children: [{ text: "Task" }], id: "task", type: "p" },
      { children: [{ text: "" }], id: "task-labels", indent: 1, tanaFieldId: "labels", type: "p" },
      { children: [{ text: "one" }], id: "task-label-one", indent: 2, tanaFieldValueType: "plain", type: "p" },
      { children: [{ text: "two" }], id: "task-label-two", indent: 2, tanaFieldValueType: "plain", type: "p" },
    ]);

    assert.deepEqual(
      runTanaQuery(listIndex, createAndQuery([
        { fieldId: "labels", kind: "field-equals", value: { type: "plain", value: "two" } },
      ])).map(({ id }) => id),
      ["task"],
    );
    assert.deepEqual(
      runTanaQuery(listIndex, createAndQuery([
        { fieldId: "labels", kind: "field-exists" },
      ])).map(({ id }) => id),
      ["task"],
    );
  });

  test("treats invalid and incompatible stored Values as existing rather than absent", () => {
    const advisoryIndex = buildTanaIndex([
      { children: [{ text: "Estimate" }], id: "estimate", tanaFieldDefinition: { max: 8, type: "number" }, type: "p" },
      { children: [{ text: "Task" }], id: "task", type: "p" },
      { children: [{ text: "" }], id: "task-estimate", indent: 1, tanaFieldId: "estimate", type: "p" },
      { children: [{ text: "draft" }], id: "task-estimate-value", indent: 2, tanaFieldValueType: "number", type: "p" },
      { children: [{ text: "Historical" }], id: "historical", type: "p" },
      { children: [{ text: "" }], id: "historical-estimate", indent: 1, tanaFieldId: "estimate", type: "p" },
      { children: [{ text: "legacy" }], id: "historical-estimate-value", indent: 2, tanaFieldValueType: "plain", type: "p" },
    ]);
    const exists = { fieldId: "estimate", kind: "field-exists" } as const;

    assert.deepEqual(
      runTanaQuery(advisoryIndex, createAndQuery([exists])).map(({ id }) => id),
      ["task", "historical"]
    );
    assert.equal(
      isTanaQueryPredicateValid(advisoryIndex, {
        fieldId: "estimate",
        kind: "field-equals",
        value: { type: "number", value: 99 },
      }),
      true
    );
  });

  test("treats both a template-derived and an ad-hoc Field Node as field-defined", () => {
    assert.deepEqual(
      run([{ fieldId: "estimate", kind: "field-defined" }]).map(({ id }) => id),
      ["alpha", "gamma"],
    );
    assert.deepEqual(
      run([{ fieldId: "status", kind: "field-defined" }]).map(({ id }) => id),
      ["alpha", "beta"],
    );
  });

  test("supports case-insensitive text contains", () => {
    assert.deepEqual(
      run([{ kind: "text-contains", text: "BETA" }]).map(({ id }) => id),
      ["beta"],
    );
  });

  test("evaluates AND, OR, and NOT directly from a persisted query expression", () => {
    assert.deepEqual(
      runTanaQuery(index, {
        children: [
          {
            predicate: { kind: "text-contains", text: "beta" },
            type: "predicate",
          },
          {
            predicate: { kind: "text-contains", text: "gamma" },
            type: "predicate",
          },
        ],
        type: "or",
      }).map(({ id }) => id),
      ["beta", "gamma"],
    );
    assert.equal(
      runTanaQuery(index, {
        child: {
          predicate: { kind: "has-supertag", supertagId: "project-tag" },
          type: "predicate",
        },
        type: "not",
      }).some(({ id }) => id === "alpha"),
      false,
    );
    assert.deepEqual(
      runTanaQuery(index, {
        children: [
          {
            children: [
              {
                predicate: { kind: "text-contains", text: "alpha" },
                type: "predicate",
              },
              {
                predicate: { kind: "text-contains", text: "beta" },
                type: "predicate",
              },
            ],
            type: "or",
          },
          {
            child: {
              predicate: { kind: "text-contains", text: "beta" },
              type: "predicate",
            },
            type: "not",
          },
        ],
        type: "and",
      }).map(({ id }) => id),
      ["alpha"],
    );
  });

  test("evaluates graph predicates from hierarchy and derived References", () => {
    assert.deepEqual(
      run([{ kind: "child-of", nodeId: "parent" }]).map(({ id }) => id),
      ["child"],
    );
    assert.deepEqual(
      run([{ kind: "descendant-of", nodeId: "parent" }]).map(({ id }) => id),
      ["child", "grandchild"],
    );
    assert.deepEqual(
      run([{ kind: "references", nodeId: "alpha" }]).map(({ id }) => id),
      ["alpha"],
    );
    assert.deepEqual(
      run([{ kind: "referenced-by", nodeId: "alpha-reference" }]).map(
        ({ id }) => id,
      ),
      [],
    );
  });

  test("describes query clauses in the Chinese interface without changing query semantics", () => {
    assert.equal(
      describeTanaQueryClause(index, {
        kind: "has-supertag",
        supertagId: "project-tag",
      }),
      "包含 #Project",
    );
    assert.equal(
      describeTanaQueryClause(index, {
        kind: "field-equals",
        fieldId: "status",
        value: { type: "options", value: "active" },
      }),
      "Status 等于 active",
    );
    assert.equal(
      describeTanaQueryExpression(index, {
        children: [
          {
            predicate: { kind: "text-contains", text: "alpha" },
            type: "predicate",
          },
          {
            child: {
              predicate: { kind: "text-contains", text: "beta" },
              type: "predicate",
            },
            type: "not",
          },
        ],
        type: "and",
      }),
      "（文本包含“alpha” 且 非（文本包含“beta”））",
    );
  });

  test("validates new clauses against existing Tana definitions", () => {
    assert.equal(
      isTanaQueryPredicateValid(index, {
        kind: "has-supertag",
        supertagId: "project-tag",
      }),
      true,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, {
        kind: "has-supertag",
        supertagId: "alpha",
      }),
      false,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, {
        fieldId: "estimate",
        kind: "field-exists",
      }),
      true,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, {
        fieldId: "alpha",
        kind: "field-defined",
      }),
      false,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, {
        fieldId: "status",
        kind: "field-equals",
        value: { type: "options", value: "done" },
      }),
      true,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, {
        fieldId: "status",
        kind: "field-equals",
        value: { type: "options", value: "alpha" },
      }),
      true,
    );
    assert.equal(
      isTanaQueryPredicateValid(index, { kind: "text-contains", text: "  " }),
      false,
    );
  });
  test("fails closed for a broken target even beneath NOT and restores when identity returns", () => {
    const query = {
      child: { predicate: { kind: "has-supertag", supertagId: "project-tag" }, type: "predicate" as const },
      type: "not" as const,
    };
    const withoutTag = buildTanaIndex(document.filter((node) => node.id !== "project-tag"));

    assert.deepEqual(runTanaQuery(withoutTag, query), []);
    assert.equal(diagnoseTanaQuery(withoutTag, query)[0]?.code, "missing-supertag");
    assert.equal(
      runTanaQuery(index, query).some(({ id }) => id === "beta"),
      true,
    );
  });

  test("keeps broken target identities stable until the same canonical identities return", () => {
    const source: Value = [
      { children: [{ text: "Project" }], id: "tag", tanaSupertagDefinition: {}, type: "p" },
      { children: [{ text: "Status" }], id: "field", tanaFieldDefinition: { type: "options" }, type: "p" },
      { children: [{ text: "Open" }], id: "option", indent: 1, type: "p" },
      { children: [{ text: "Parent" }], id: "parent", type: "p" },
      { children: [{ text: "Match" }], id: "match", indent: 1, tanaSupertagIds: ["tag"], type: "p" },
      { children: [{ text: "" }], id: "match-field", indent: 2, tanaFieldId: "field", type: "p" },
      {
        children: [{ children: [{ text: "" }], key: "option", type: "mention" }],
        id: "match-value",
        indent: 3,
        tanaFieldValueType: "options",
        type: "p",
      },
    ];
    const query = createAndQuery([
      { kind: "has-supertag", supertagId: "tag" },
      {
        fieldId: "field",
        kind: "field-equals",
        value: { type: "options", value: "option" },
      },
      { kind: "child-of", nodeId: "parent" },
    ]);
    const expectedAst = structuredClone(query);
    const withoutTargets = source.filter(
      (node) => !["tag", "field", "option", "parent"].includes(String(node.id)),
    );
    const active = buildTanaIndex(source);
    const broken = buildTanaIndex(withoutTargets);
    const replacement = buildTanaIndex([
      ...withoutTargets,
      { children: [{ text: "Project" }], id: "replacement-tag", tanaSupertagDefinition: {}, type: "p" },
      { children: [{ text: "Status" }], id: "replacement-field", tanaFieldDefinition: { type: "options" }, type: "p" },
      { children: [{ text: "Open" }], id: "replacement-option", indent: 1, type: "p" },
      { children: [{ text: "Parent" }], id: "replacement-parent", type: "p" },
    ]);

    assert.deepEqual(runTanaQuery(active, query).map(({ id }) => id), ["match"]);
    assert.deepEqual(runTanaQuery(broken, query), []);
    assert.deepEqual(query, expectedAst);
    assert.deepEqual(runTanaQuery(replacement, query), []);
    assert.deepEqual(runTanaQuery(buildTanaIndex(source), query).map(({ id }) => id), ["match"]);
  });

  test("returns a canonical result once when an occurrence and target both match", () => {
    assert.deepEqual(
      run([{ kind: "text-contains", text: "alpha" }]).map(({ id }) => id),
      ["alpha"],
    );
  });

  test("caps derived Search results at 2500 and excludes the owning Search", () => {
    const many = buildTanaIndex(Array.from({ length: 2502 }, (_, number) => ({
      children: [{ text: `Result ${number}` }],
      id: `result-${number}`,
      type: "p",
    })));
    assert.equal(runTanaQuery(many, createAndQuery()).length, 2500);
    assert.equal(runTanaQuery(many, createAndQuery(), { excludeNodeId: "result-0" })[0]?.id, "result-1");
  });

});

test('runs numeric/date comparisons, completion, semantic, regex and grandparent predicates', () => {
  const featureIndex = buildTanaIndex([
    { children: [{ text: 'Estimate' }], id: 'estimate', tanaFieldDefinition: { type: 'number' }, type: 'p' },
    { children: [{ text: 'When' }], id: 'when', tanaFieldDefinition: { type: 'date' }, type: 'p' },
    { children: [{ text: 'Grandparent' }], id: 'grandparent', type: 'p' },
    { children: [{ text: 'Parent' }], id: 'parent', indent: 1, type: 'p' },
    { children: [{ text: 'Release 42' }], id: 'release', indent: 2, tanaDoneState: 'done', type: 'p' },
    { children: [{ text: '' }], id: 'release-estimate', indent: 3, tanaFieldId: 'estimate', type: 'p' },
    { children: [{ text: '42' }], id: 'release-estimate-value', indent: 4, tanaFieldValueType: 'number', type: 'p' },
    { children: [{ text: '' }], id: 'release-when', indent: 3, tanaFieldId: 'when', type: 'p' },
    { children: [{ text: '2026-09-10' }], id: 'release-when-value', indent: 4, tanaFieldValueType: 'date', type: 'p' },
    { children: [{ text: '2026-09-11' }], id: 'day', tanaTime: { unit: 'day', value: '2026-09-11' }, type: 'p' },
    { children: [{ text: 'Search' }], id: 'search', tanaSearchDefinition: { query: createAndQuery() }, type: 'p' },
  ]);
  const ids = (predicate: TanaQueryPredicate) =>
    runTanaQuery(featureIndex, createAndQuery([predicate])).map(({ id }) => id);

  assert.deepEqual(ids({ fieldId: 'estimate', kind: 'field-greater-than', value: { type: 'number', value: 40 } }), ['release']);
  assert.deepEqual(ids({ fieldId: 'estimate', kind: 'field-less-than', value: { type: 'number', value: 50 } }), ['release']);
  assert.deepEqual(ids({ kind: 'done-state', state: 'done' }), ['release']);
  assert.deepEqual(ids({ date: '2026-09-10', kind: 'date-is' }), ['release']);
  assert.deepEqual(ids({ kind: 'is-semantic', semantic: 'calendar-node' }), ['day']);
  assert.deepEqual(ids({ kind: 'is-semantic', semantic: 'search' }), ['search']);
  assert.deepEqual(ids({ kind: 'text-matches-regex', pattern: '^Release\\s+\\d+$' }), ['release']);
  assert.deepEqual(ids({ kind: 'grandchild-of', nodeId: 'grandparent' }), ['release']);
  assert.deepEqual(ids({ fieldId: 'estimate', kind: 'has-field' }), ['release']);
});
