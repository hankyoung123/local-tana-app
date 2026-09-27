import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { initialDocument } from "./initial-document";
import { isValidTanaDocument } from "./persistence";
import type { TanaBlockElement } from "./types";

function copyDocument() {
  return JSON.parse(JSON.stringify(initialDocument)) as typeof initialDocument;
}

describe("workspace UI persistence boundary", () => {
  test("accepts legacy metadata-free workspaces and preserves unknown pinned IDs", () => {
    const legacy = copyDocument();
    assert.equal(isValidTanaDocument(legacy), true);
    const withUi = copyDocument();
    const workspace = withUi[0] as TanaBlockElement;
    workspace.tanaWorkspaceUi = {
      sidebar: {
        mode: "hidden",
        width: 280,
        topItems: [],
        pinnedNodeIds: ["restored-later"],
      },
      quickAddDraft: "keep me",
    };
    assert.equal(isValidTanaDocument(withUi), true);
    assert.deepEqual(workspace.tanaWorkspaceUi?.sidebar?.pinnedNodeIds, [
      "restored-later",
    ]);
  });

  test("rejects invalid mode, width and duplicate pinned IDs", () => {
    const invalidMode = copyDocument();
    (invalidMode[0] as TanaBlockElement).tanaWorkspaceUi = {
      sidebar: { mode: "drawer" as never },
    };
    assert.equal(isValidTanaDocument(invalidMode), false);
    const invalidWidth = copyDocument();
    (invalidWidth[0] as TanaBlockElement).tanaWorkspaceUi = {
      sidebar: { width: 40 },
    };
    assert.equal(isValidTanaDocument(invalidWidth), false);
    const duplicatePins = copyDocument();
    (duplicatePins[0] as TanaBlockElement).tanaWorkspaceUi = {
      sidebar: { pinnedNodeIds: ["same", "same"] },
    };
    assert.equal(isValidTanaDocument(duplicatePins), false);
  });
});
