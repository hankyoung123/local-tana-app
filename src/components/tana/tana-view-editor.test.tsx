import assert from "node:assert/strict";
import { test } from "node:test";

import { KEYS, type Value } from "platejs";
import { createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorKit } from "@/components/editor/editor-kit";
import { isTanaNodeElement } from "@/lib/tana/constants";
import { buildTanaIndex } from "@/lib/tana/index";

import {
  createNotDoneQueryExpression,
  TanaSearchDefinitionEditor,
} from "./tana-view-editor";

test("Search Builder exposes a one-click NOT DONE expression", () => {
  assert.deepEqual(createNotDoneQueryExpression(), {
    child: { predicate: { kind: "done-state", state: "done" }, type: "predicate" },
    type: "not",
  });

  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement },
    plugins: EditorKit,
    value: [{
      children: [{ text: "Search" }],
      id: "search",
      tanaSearchDefinition: { query: { children: [], type: "and" } },
      type: KEYS.p,
    }] as Value,
  });
  const node = editor.children[0]!;
  const markup = renderToStaticMarkup(
    <TanaSearchDefinitionEditor
      editor={editor}
      index={buildTanaIndex(editor.children)}
      node={node}
      nodeId="search"
    />,
  );

  assert.match(markup, /NOT DONE/u);
});
