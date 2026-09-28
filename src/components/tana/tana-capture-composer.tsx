"use client";

import * as React from "react";
import type { Value } from "platejs";
import { nanoid } from "platejs";
import { createPlatePlugin, Plate, PlateElement, usePlateEditor } from "platejs/react";
import type { PlateElementProps } from "platejs/react";

import { EditorKit } from "@/components/editor/editor-kit";
import { TanaFieldPlugin } from "@/components/editor/plugins/tana-field-plugin";
import { Editor, EditorContainer } from "@/components/ui/editor";
import {
  captureDraftHasText,
  extractTanaCaptureDraft,
  normalizeTanaCaptureDraft,
} from "@/lib/tana/capture";
import type { TanaBlockElement, TanaCaptureDraft, TanaIndex } from "@/lib/tana";
import { TanaIndexProvider } from "./tana-index-context";

type Props = {
  ariaLabel: string;
  document: Value;
  index: TanaIndex;
  draft: TanaCaptureDraft;
  pending?: boolean;
  error?: string;
  submitLabel?: string;
  onChange: (draft: TanaCaptureDraft) => void;
  onSubmit: (draft: TanaCaptureDraft) => void;
  onCancel: () => void;
};

const CAPTURE_HIDDEN_TYPE = "tana_capture_hidden";
const CaptureHiddenPlugin = createPlatePlugin({
  key: CAPTURE_HIDDEN_TYPE,
  node: { isElement: true },
}).withComponent((props: PlateElementProps) => (
  <PlateElement {...props} attributes={{ ...props.attributes, style: { display: "none" } }}>
    {props.children}
  </PlateElement>
));

/**
 * A transient Plate editor. Its value is never persisted; submit hands a
 * sanitized rich draft to TanaCapturePlugin, which is the only canonical
 * writer. The semantic candidate index is read-only and comes from the main
 * document.
 */
export function TanaCaptureComposer({
  ariaLabel,
  document,
  index,
  draft,
  pending = false,
  error,
  submitLabel = "添加",
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const [transientId] = React.useState(() => `capture-${nanoid()}`);
  const value = React.useMemo<Value>(() => {
    const root = {
      children: [...normalizeTanaCaptureDraft(draft).content],
      id: transientId,
      type: "p",
      ...(draft.supertagIds?.length ? { tanaSupertagIds: [...draft.supertagIds] } : {}),
    } as TanaBlockElement;
    const hiddenDocument = structuredClone(document).map((node) => ({
      ...node,
      type: CAPTURE_HIDDEN_TYPE,
    }));
    return [root, ...hiddenDocument] as Value;
  }, [document, draft, transientId]);
  const editor = usePlateEditor({ plugins: [CaptureHiddenPlugin, ...EditorKit], value });
  const lastDraft = React.useRef("");
  const initialized = React.useRef(false);
  const latestDraft = React.useRef(draft);

  React.useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  React.useEffect(() => {
    editor.tf.focus();
    const end = editor.api.end([0]);
    if (end) editor.tf.select({ anchor: end, focus: end });
  }, [editor]);

  React.useEffect(() => {
    const next = normalizeTanaCaptureDraft(draft);
    const serialized = JSON.stringify(next);
    if (serialized === lastDraft.current) return;
    const entry = editor.api.node({ at: [], id: transientId });
    if (!entry) return;
    editor.tf.setNodes(
      {
        children: [...next.content],
      },
      { at: entry[1] },
    );
    if (next.supertagIds?.length) {
      editor.tf.setNodes({ tanaSupertagIds: [...next.supertagIds] }, { at: entry[1] });
    } else {
      editor.tf.unsetNodes("tanaSupertagIds", { at: entry[1] });
    }
    for (const field of next.fields ?? []) {
      const fields = editor.getTransforms(TanaFieldPlugin).field;
      if (fields.materialize(transientId, field.fieldId) && field.value) {
        fields.setValue(transientId, field.fieldId, field.value);
      }
    }
    lastDraft.current = serialized;
  }, [draft, editor, transientId]);

  React.useEffect(() => {
    initialized.current = true;
  }, [editor]);

  const handleValueChange = React.useCallback(
    ({ value: nextValue }: { value: Value }) => {
      if (!initialized.current) return;
      const entry = nextValue.find(
        (node) =>
          typeof node === "object" &&
          node !== null &&
          "id" in node &&
          node.id === transientId,
      );
      if (!entry || !("children" in entry)) return;
      const nextDraft = extractTanaCaptureDraft(nextValue, transientId);
      if (!nextDraft) return;
      const serialized = JSON.stringify(nextDraft);
      lastDraft.current = serialized;
      latestDraft.current = nextDraft;
      onChange(nextDraft);
    },
    [onChange, transientId],
  );

  const submit = React.useCallback(() => {
    const next = normalizeTanaCaptureDraft(draft);
    if (!captureDraftHasText(next) || pending) return;
    onSubmit(next);
  }, [draft, onSubmit, pending]);
  const focusCaptureRoot = React.useCallback(() => {
    if (editor.selection?.anchor.path[0] === 0) return;
    const end = editor.api.end([0]);
    if (end) editor.tf.select({ anchor: end, focus: end });
  }, [editor]);
  const cancel = React.useCallback(() => {
    const currentDraft = extractTanaCaptureDraft(editor.children, transientId);
    const nextDraft = currentDraft ?? latestDraft.current;
    latestDraft.current = nextDraft;
    onChange(nextDraft);
    onCancel();
  }, [editor, onCancel, onChange, transientId]);

  return (
    <Plate editor={editor} onValueChange={handleValueChange}>
      <TanaIndexProvider index={index}>
        <EditorContainer variant="select" className="max-h-48 min-h-16">
          <Editor
            aria-label={ariaLabel}
            autoFocus
            className="capture-editor min-h-16 px-3 py-2 text-sm"
            disabled={pending}
            variant="none"
            onFocus={focusCaptureRoot}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </EditorContainer>
      </TanaIndexProvider>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded px-3 py-1.5 text-xs hover:bg-[var(--tana-hover)]"
          type="button"
          onClick={cancel}
        >
          取消
        </button>
        <button
          className="rounded bg-[var(--tana-accent)] px-3 py-1.5 text-white text-xs disabled:opacity-50"
          disabled={pending || !captureDraftHasText(normalizeTanaCaptureDraft(draft))}
          type="button"
          onClick={submit}
        >
          {pending ? "保存中…" : submitLabel}
        </button>
      </div>
    </Plate>
  );
}
