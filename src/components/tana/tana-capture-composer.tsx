"use client";

import * as React from "react";

type TanaCaptureComposerProps = {
  ariaLabel: string;
  value: string;
  pending?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  pendingLabel?: string;
};

/**
 * Shared transient composer chrome for in-app Quick Add and the Tauri clipper.
 * It owns no Plate value and never writes canonical data; callers provide the
 * one main-editor commit boundary and decide what Escape should do.
 */
export function TanaCaptureComposer({
  ariaLabel,
  value,
  pending = false,
  error,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = "添加",
  pendingLabel = "保存中…",
}: TanaCaptureComposerProps) {
  return (
    <>
      <textarea
        aria-label={ariaLabel}
        autoFocus
        className="min-h-28 w-full rounded-md border border-[var(--tana-divider)] bg-transparent p-2 text-sm outline-none focus:ring-2 focus:ring-[var(--tana-accent)]"
        disabled={pending}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) {
            event.preventDefault();
            onCancel();
            return;
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter"
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded px-3 py-1.5 text-xs hover:bg-[var(--tana-hover)]"
          type="button"
          disabled={pending}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="rounded bg-[var(--tana-accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
          type="button"
          disabled={pending || value.length === 0}
          onClick={onSubmit}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </>
  );
}
