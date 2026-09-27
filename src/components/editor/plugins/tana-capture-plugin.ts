import { createPlatePlugin, type PlateEditor } from "platejs/react";

import { TanaTimePlugin } from "./tana-time-plugin";
import { TanaZoomPlugin } from "./tana-zoom-plugin";
import { insertTanaChild } from "./tana-node-identity-plugin";

export const TANA_CAPTURE_PLUGIN_KEY = "tanaCapture" as const;

/** The only entry point for transient capture surfaces to create canonical Nodes. */
export const TanaCapturePlugin = createPlatePlugin({
  key: TANA_CAPTURE_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  capture: {
    commit: (text: string, options?: { zoom?: boolean; select?: boolean }) => {
      const dayId = editor.getTransforms(TanaTimePlugin).time.ensureToday();
      if (!dayId) return;
      const nodeId = insertTanaChild(editor, dayId, text, {
        select: options?.select ?? options?.zoom,
      });
      if (nodeId && options?.zoom)
        editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
      return nodeId;
    },
  },
}));

export function commitTanaCapture(
  editor: PlateEditor,
  text: string,
  options?: { zoom?: boolean; select?: boolean },
) {
  return editor.getTransforms(TanaCapturePlugin).capture.commit(text, options);
}
