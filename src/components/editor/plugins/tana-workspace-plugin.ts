import { createPlatePlugin, type PlateEditor } from "platejs/react";

import { buildTanaIndex, getTanaProjectionTarget } from "@/lib/tana";
import {
  mergeTanaWorkspaceUi,
  normalizeTanaWorkspaceUi,
} from "@/lib/tana/workspace-ui";
import type { NodeId, TanaWorkspaceUi } from "@/lib/tana/types";

export const TANA_WORKSPACE_PLUGIN_KEY = "tanaWorkspace" as const;

function updateWorkspaceUi(editor: PlateEditor, ui: TanaWorkspaceUi): boolean {
  const index = buildTanaIndex(editor.children);
  const workspaceId = index.systemNodeIds.get("workspace");
  const workspacePath = workspaceId
    ? index.nodesById.get(workspaceId)?.path
    : undefined;
  if (!workspacePath) return false;
  editor.tf.setNodes({ tanaWorkspaceUi: ui }, { at: workspacePath });
  return true;
}

function setPinned(
  editor: PlateEditor,
  nodeId: NodeId,
  pinned: boolean,
): boolean {
  const index = buildTanaIndex(editor.children);
  const target = getTanaProjectionTarget(index, nodeId);
  if (!target) return false;
  const workspaceId = index.systemNodeIds.get("workspace");
  const current = normalizeTanaWorkspaceUi(
    workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
  );
  const ids = [...(current.sidebar?.pinnedNodeIds ?? [])];
  const alreadyPinned = ids.includes(target.id);
  if (pinned && !alreadyPinned) ids.push(target.id);
  if (!pinned && alreadyPinned) ids.splice(ids.indexOf(target.id), 1);
  if (pinned === alreadyPinned) return true;
  return updateWorkspaceUi(
    editor,
    mergeTanaWorkspaceUi(current, { sidebar: { pinnedNodeIds: ids } }),
  );
}

export const TanaWorkspacePlugin = createPlatePlugin({
  key: TANA_WORKSPACE_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  workspace: {
    setUi: (ui: TanaWorkspaceUi) => updateWorkspaceUi(editor, ui),
    setPinned: (nodeId: NodeId, pinned: boolean) =>
      setPinned(editor, nodeId, pinned),
    togglePinned: (nodeId: NodeId) => {
      const index = buildTanaIndex(editor.children);
      const target = getTanaProjectionTarget(index, nodeId);
      if (!target) return false;
      const workspaceId = index.systemNodeIds.get("workspace");
      const current = normalizeTanaWorkspaceUi(
        workspaceId ? index.nodesById.get(workspaceId)?.workspaceUi : undefined,
      );
      return setPinned(
        editor,
        nodeId,
        !(current.sidebar?.pinnedNodeIds ?? []).includes(target.id),
      );
    },
  },
}));
