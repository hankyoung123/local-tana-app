import assert from "node:assert/strict";
import { test } from "node:test";
import { KEYS, type Value } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorKit } from "@/components/editor/editor-kit";
import { isTanaNodeElement } from "@/lib/tana";
import { TanaWorkspacePlugin } from "./tana-workspace-plugin";

test("workspace presentation metadata is written to the canonical Workspace Node", () => {
  const value: Value = [
    {
      children: [{ text: "Workspace" }],
      id: "workspace",
      tanaSystemNode: "workspace",
      type: KEYS.p,
    },
    {
      children: [{ text: "Home" }],
      id: "home",
      indent: 1,
      tanaSystemNode: "home",
      type: KEYS.p,
    },
    {
      children: [{ text: "Daily" }],
      id: "daily",
      indent: 1,
      tanaSystemNode: "daily-notes",
      type: KEYS.p,
    },
    {
      children: [{ text: "Schema" }],
      id: "schema",
      indent: 1,
      tanaSystemNode: "schema",
      type: KEYS.p,
    },
    {
      children: [{ text: "Library" }],
      id: "library",
      indent: 1,
      tanaSystemNode: "library",
      type: KEYS.p,
    },
    {
      children: [{ text: "Settings" }],
      id: "settings",
      indent: 1,
      tanaSystemNode: "settings",
      type: KEYS.p,
    },
    {
      children: [{ text: "Trash" }],
      id: "trash",
      indent: 1,
      tanaSystemNode: "trash",
      type: KEYS.p,
    },
  ];
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: "always" },
    plugins: EditorKit,
    value,
  });
  assert.deepEqual(
    editor
      .getTransforms(TanaWorkspacePlugin)
      .workspace.setUi({ quickAddDraft: { content: [{ text: "saved" }] } }),
    true,
  );
  assert.deepEqual(
    (editor.children[0] as { tanaWorkspaceUi?: { quickAddDraft?: unknown } })
      .tanaWorkspaceUi?.quickAddDraft,
    { content: [{ text: "saved" }] },
  );
});

test("pinning a Reference stores its live canonical target and is idempotent", () => {
  const value: Value = [
    {
      children: [{ text: "Workspace" }],
      id: "workspace",
      tanaSystemNode: "workspace",
      type: KEYS.p,
    },
    {
      children: [{ text: "Target" }],
      id: "target",
      indent: 1,
      type: KEYS.p,
    },
    {
      children: [{ text: "Reference" }],
      id: "reference",
      indent: 1,
      tanaReferenceTargetId: "target",
      type: KEYS.p,
    },
  ];
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: "always" },
    plugins: EditorKit,
    value,
  });
  const workspace = editor.getTransforms(TanaWorkspacePlugin).workspace;

  assert.equal(workspace.setPinned("reference", true), true);
  assert.equal(workspace.setPinned("reference", true), true);
  assert.deepEqual(
    (editor.children[0] as { tanaWorkspaceUi?: { sidebar?: { pinnedNodeIds?: string[] } } })
      .tanaWorkspaceUi?.sidebar?.pinnedNodeIds,
    ["target"],
  );
  assert.equal(workspace.setPinned("reference", false), true);
  assert.deepEqual(
    (editor.children[0] as { tanaWorkspaceUi?: { sidebar?: { pinnedNodeIds?: string[] } } })
      .tanaWorkspaceUi?.sidebar?.pinnedNodeIds,
    [],
  );
});
