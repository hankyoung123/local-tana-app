import { ElementApi } from 'platejs';
import type { NodeEntry } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  getNodeBehavior,
  getNodeSemanticType,
  getNodeSemanticTypes,
  isTanaNodeElement,
  type NodeId,
  type TanaBlockElement,
  type TanaNodeBehavior,
  type TanaNodeSemanticType,
} from '@/lib/tana';

export const TANA_NODE_PLUGIN_KEY = 'tanaNode' as const;

export type TanaRuntimeNode = {
  behavior: TanaNodeBehavior;
  id: NodeId;
  node: TanaBlockElement;
  path: number[];
  /** The renderer registry key; renderers themselves remain React-only. */
  renderer: TanaNodeSemanticType;
  semanticType: TanaNodeSemanticType;
  semanticTypes: readonly TanaNodeSemanticType[];
};

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  if (!entry || !ElementApi.isElement(entry[0]) || !isTanaNodeElement(entry)) {
    return;
  }

  return entry as NodeEntry<TanaBlockElement>;
}

function resolveTanaNode(
  editor: PlateEditor,
  nodeId: NodeId
): TanaRuntimeNode | undefined {
  const entry = getTanaNodeEntry(editor, nodeId);

  if (!entry || typeof entry[0].id !== 'string') return;

  const [node, path] = entry;
  const id = node.id;

  if (typeof id !== 'string') return;
  const context = { document: editor.children, path };
  const semanticType = getNodeSemanticType(node, context);

  return {
    behavior: getNodeBehavior(node, context),
    id,
    node,
    path,
    renderer: semanticType,
    semanticType,
    semanticTypes: getNodeSemanticTypes(node, context),
  };
}

/**
 * Thin Plate integration: NodeId resolves the derived semantic, renderer key,
 * and behavior. It owns no document state or editor interaction path.
 */
export const TanaNodePlugin = createPlatePlugin({
  key: TANA_NODE_PLUGIN_KEY,
}).extendEditorApi(({ editor }) => ({
  tanaNode: {
    resolve: (nodeId: NodeId) => resolveTanaNode(editor, nodeId),
  },
}));
