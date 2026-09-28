"use client";

import * as React from "react";
import type { Value } from "platejs";

import { TanaCaptureComposer } from "./tana-capture-composer";
import {
  captureDraftHasText,
  normalizeTanaCaptureDraft,
  type TanaCaptureAck,
  type TanaCaptureDraft,
} from "@/lib/tana";
import { buildTanaIndex } from "@/lib/tana/index";
import { initialDocument } from "@/lib/tana/initial-document";

export function TanaClipper() {
  const [draft, setDraft] = React.useState<TanaCaptureDraft>(() => normalizeTanaCaptureDraft(""));
  const [document, setDocument] = React.useState<Value>(initialDocument);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const requestId = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    let disposed = false;
    let stopAck: (() => void) | undefined;
    let stopContext: (() => void) | undefined;
    void Promise.all([import("@tauri-apps/api/event"), import("@tauri-apps/api/window")])
      .then(async ([eventApi, windowApi]) => {
        const ack = await eventApi.listen<TanaCaptureAck>("f08://capture-ack", async (event) => {
          if (disposed || !requestId.current || event.payload.requestId !== requestId.current) return;
          setPending(false);
          if (event.payload.ok) await windowApi.getCurrentWindow().close();
          else setError(event.payload.error ?? "保存失败");
        });
        const context = await eventApi.listen<{ document?: Value }>("f08://capture-context", (event) => {
          if (!disposed && Array.isArray(event.payload.document)) {
            setDocument(event.payload.document);
            setDocumentVersion((version) => version + 1);
          }
        });
        if (disposed) {
          ack();
          context();
        } else {
          stopAck = ack;
          stopContext = context;
          await eventApi.emitTo("main", "f08://capture-context-request");
        }
      })
      .catch(() => setError("桌面捕获不可用"));
    return () => {
      disposed = true;
      stopAck?.();
      stopContext?.();
    };
  }, []);

  const submit = React.useCallback(async (nextDraft: TanaCaptureDraft) => {
    if (pending || !captureDraftHasText(nextDraft)) return;
    setError(undefined);
    setPending(true);
    const nextRequestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    requestId.current = nextRequestId;
    try {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo("main", "f08://capture-submit", { requestId: nextRequestId, ...nextDraft });
    } catch {
      setPending(false);
      setError("桌面捕获不可用");
    }
  }, [pending]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--tana-canvas)] p-4 text-[var(--tana-text)]">
      <section className="w-full max-w-xl rounded-xl border border-[var(--tana-divider)] bg-[var(--tana-sidebar)] p-4 shadow-2xl">
        <header className="mb-3 flex items-center justify-between" data-tauri-drag-region>
          <h1 className="font-medium">Global Capture</h1>
          <span className="text-[10px] text-[var(--tana-text-tertiary)]">Today</span>
        </header>
        <TanaCaptureComposer
          key={`capture-${documentVersion}`}
          ariaLabel="Global Capture 草稿"
          document={document}
          index={buildTanaIndex(document)}
          draft={draft}
          pending={pending}
          error={error}
          submitLabel="保存"
          onChange={setDraft}
          onSubmit={(next) => void submit(next)}
          onCancel={() =>
            void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close())
          }
        />
      </section>
    </main>
  );
}
