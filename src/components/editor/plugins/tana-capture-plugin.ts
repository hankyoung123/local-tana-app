import { createPlatePlugin, type PlateEditor } from "platejs/react";

import { normalizeTanaCaptureDraft } from "@/lib/tana/capture";
import type { TanaCaptureDraft } from "@/lib/tana/types";
import { TanaTimePlugin } from "./tana-time-plugin";
import { TanaZoomPlugin } from "./tana-zoom-plugin";
import { TanaFieldPlugin } from "./tana-field-plugin";
import { TanaSupertagPlugin } from "./tana-supertag-plugin";
import { insertTanaChild } from "./tana-node-identity-plugin";

export const TANA_CAPTURE_PLUGIN_KEY = "tanaCapture" as const;

/** The only entry point for transient capture surfaces to create canonical Nodes. */
export const TanaCapturePlugin = createPlatePlugin({
  key: TANA_CAPTURE_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  capture: {
    commit: (draft: TanaCaptureDraft | string, options?: { zoom?: boolean; select?: boolean }) => {
      const normalized = normalizeTanaCaptureDraft(draft);
      const dayId = editor.getTransforms(TanaTimePlugin).time.ensureToday();
      if (!dayId) return;
      const nodeId = insertTanaChild(editor, dayId, normalized.content, {
        select: options?.select ?? options?.zoom,
      });
      if (nodeId) {
        for (const supertagId of normalized.supertagIds ?? []) {
          editor.getTransforms(TanaSupertagPlugin).supertag.apply(nodeId, supertagId);
        }
        for (const field of normalized.fields ?? []) {
          const fields = editor.getTransforms(TanaFieldPlugin).field;
          if (!fields.materialize(nodeId, field.fieldId)) continue;
          if (field.value) fields.setValue(nodeId, field.fieldId, field.value);
        }
      }
      if (nodeId && options?.zoom)
        editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
      return nodeId;
    },
  },
}));

export function commitTanaCapture(
  editor: PlateEditor,
  draft: TanaCaptureDraft | string,
  options?: { zoom?: boolean; select?: boolean },
) {
  return editor.getTransforms(TanaCapturePlugin).capture.commit(draft, options);
}
