"use client";

import * as React from "react";

import type { TanaCaptureAck } from "@/lib/tana";
import { TanaCaptureComposer } from "./tana-capture-composer";

export function TanaClipper() {
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void Promise.all([
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/window"),
    ])
      .then(async ([eventApi, windowApi]) => {
        const unlisten = await eventApi.listen<TanaCaptureAck>(
          "f08://capture-ack",
          async (event) => {
            if (disposed) return;
            setPending(false);
            if (event.payload.ok) {
              await windowApi.getCurrentWindow().close();
            } else {
              setError(event.payload.error ?? "保存失败");
            }
          },
        );
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => setError("桌面捕获不可用"));
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  const submit = async () => {
    if (pending || text.length === 0) return;
    setError(undefined);
    setPending(true);
    try {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo("main", "f08://capture-submit", { text });
    } catch {
      setPending(false);
      setError("桌面捕获不可用");
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--tana-canvas)] p-4 text-[var(--tana-text)]">
      <section className="w-full max-w-xl rounded-xl border border-[var(--tana-divider)] bg-[var(--tana-sidebar)] p-4 shadow-2xl">
        <header
          className="mb-3 flex items-center justify-between"
          data-tauri-drag-region
        >
          <h1 className="font-medium">Global Capture</h1>
          <span className="text-[10px] text-[var(--tana-text-tertiary)]">
            Today
          </span>
        </header>
        <TanaCaptureComposer
          ariaLabel="Global Capture 草稿"
          value={text}
          pending={pending}
          error={error}
          onChange={setText}
          onSubmit={() => void submit()}
          onCancel={() =>
            void import("@tauri-apps/api/window").then(
              ({ getCurrentWindow }) => getCurrentWindow().close(),
            )
          }
        />
      </section>
    </main>
  );
}
