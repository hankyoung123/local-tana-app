"use client";

import * as React from "react";
import type { Value } from "platejs";
import { nanoid } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

import { EditorKit } from "@/components/editor/editor-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import {
  captureDraftHasText,
  normalizeTanaCaptureDraft,
} from "@/lib/tana/capture";
import type { TanaCaptureDraft, TanaIndex } from "@/lib/tana";
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
  void document;
  const value = React.useMemo<Value>(
    () => [
      {
        children: [...normalizeTanaCaptureDraft(draft).content],
        id: transientId,
        type: "p",
      },
    ],
    [draft, transientId],
  );
  const editor = usePlateEditor({ plugins: EditorKit, value });
  const lastDraft = React.useRef("");

  React.useEffect(() => {
    const next = normalizeTanaCaptureDraft(draft);
    const serialized = JSON.stringify(next);
    if (serialized === lastDraft.current) return;
    const entry = editor.api.node({ at: [], id: transientId });
    if (!entry) return;
    editor.tf.setNodes(
      { children: next.content },
      { at: entry[1] },
    );
    lastDraft.current = serialized;
  }, [draft, editor, transientId]);

  const handleValueChange = React.useCallback(
    ({ value: nextValue }: { value: Value }) => {
      const entry = nextValue.find(
        (node) =>
          typeof node === "object" &&
          node !== null &&
          "id" in node &&
          node.id === transientId,
      );
      if (!entry || !("children" in entry)) return;
      const nextDraft = normalizeTanaCaptureDraft({ content: entry.children });
      const serialized = JSON.stringify(nextDraft);
      lastDraft.current = serialized;
      onChange(nextDraft);
    },
    [onChange, transientId],
  );

  const submit = React.useCallback(() => {
    const next = normalizeTanaCaptureDraft(draft);
    if (!captureDraftHasText(next) || pending) return;
    onSubmit(next);
  }, [draft, onSubmit, pending]);

  return (
    <Plate editor={editor} onValueChange={handleValueChange}>
      <TanaIndexProvider index={index}>
        <EditorContainer variant="select" className="max-h-48 min-h-16">
          <Editor
            aria-label={ariaLabel}
            className="min-h-16 px-3 py-2 text-sm"
            disabled={pending}
            variant="none"
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
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
          onClick={onCancel}
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
