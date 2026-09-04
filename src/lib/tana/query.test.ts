import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Value } from "platejs";

import { buildTanaIndex } from "./index";
import {
  createAndQuery,
  describeTanaQueryClause,
  describeTanaQueryExpression,
  isTanaQueryClauseValid,
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
      ["alpha", "alpha-reference"],
    );
  });

  test("evaluates graph predicates from hierarchy and derived References", () => {
    assert.deepEqual(
      run([{ kind: "parent-is", nodeId: "parent" }]).map(({ id }) => id),
      ["child"],
    );
    assert.deepEqual(
      run([{ kind: "child-of", nodeId: "child" }]).map(({ id }) => id),
      ["parent"],
    );
    assert.deepEqual(
      run([{ kind: "descendant-of", nodeId: "parent" }]).map(({ id }) => id),
      ["child", "grandchild"],
    );
    assert.deepEqual(
      run([{ kind: "references", nodeId: "alpha" }]).map(({ id }) => id),
      ["alpha-reference"],
    );
    assert.deepEqual(
      run([{ kind: "referenced-by", nodeId: "alpha-reference" }]).map(
        ({ id }) => id,
      ),
      ["alpha"],
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
      isTanaQueryClauseValid(index, {
        kind: "has-supertag",
        supertagId: "project-tag",
      }),
      true,
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        kind: "has-supertag",
        supertagId: "alpha",
      }),
      false,
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: "estimate",
        kind: "field-exists",
      }),
      true,
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: "alpha",
        kind: "field-defined",
      }),
      false,
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: "status",
        kind: "field-equals",
        value: { type: "options", value: "done" },
      }),
      true,
    );
    assert.equal(
      isTanaQueryClauseValid(index, {
        fieldId: "status",
        kind: "field-equals",
        value: { type: "options", value: "alpha" },
      }),
      false,
    );
    assert.equal(
      isTanaQueryClauseValid(index, { kind: "text-contains", text: "  " }),
      false,
    );
  });
});
