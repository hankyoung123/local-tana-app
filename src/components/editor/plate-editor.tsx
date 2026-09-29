"use client";

import * as React from "react";

import type { Value } from "platejs";
import { isTauri } from "@tauri-apps/api/core";

import { Plate, usePlateEditor } from "platejs/react";

import { EditorKit } from "@/components/editor/editor-kit";
import { TanaCapturePlugin } from "@/components/editor/plugins/tana-capture-plugin";
import {
  type PersistenceStatus,
  TanaWorkspace,
} from "@/components/tana/tana-workspace";
import {
  createDocumentSaveController,
  isTanaNodeElement,
  loadPlateDocument,
  savePlateDocument,
  resetPlateDocument,
  usesSQLitePersistence,
  parseTanaCapturePayload,
  parseLegacyTanaCapturePayload,
  buildTanaIndex,
  type TanaCaptureAck,
} from "@/lib/tana";
import { createCloseGuard } from "@/lib/tana/close-guard";
import { initialDocument } from "@/lib/tana/initial-document";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PlateEditor() {
  const [loadedDocument, setLoadedDocument] = React.useState<Value>();
  const [loadError, setLoadError] = React.useState<string>();
  const [attempt, setAttempt] = React.useState(0);
  const [resetConfirmationOpen, setResetConfirmationOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    loadPlateDocument(initialDocument)
      .then((document) => {
        if (!cancelled) setLoadedDocument(document);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <main className="grid h-dvh place-content-center gap-4 p-8" role="alert">
        <h1 className="text-xl font-semibold">工作区加载失败</h1>
        <p>{loadError}</p>
        <p>工作区未打开。可重试，或确认清空当前工作区后重新开始。</p>
        <button
          onClick={() => {
            setLoadError(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          重试
        </button>
        <button
          onClick={() => setResetConfirmationOpen(true)}
        >
          清空并重置工作区…
        </button>
        <AlertDialog open={resetConfirmationOpen} onOpenChange={setResetConfirmationOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>清空并重置工作区？</AlertDialogTitle>
              <AlertDialogDescription>
                当前保存的数据将被永久清空，并重新载入初始工作区。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  setResetConfirmationOpen(false);
                  setLoadError(undefined);
                  try {
                    await resetPlateDocument(initialDocument);
                    setAttempt((value) => value + 1);
                  } catch (error) {
                    setLoadError(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
              >
                清空并重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  }

  if (!loadedDocument) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6f5] text-muted-foreground text-sm">
        正在加载工作区…
      </div>
    );
  }

  return <LoadedPlateEditor initialValue={loadedDocument} />;
}

function LoadedPlateEditor({ initialValue }: { initialValue: Value }) {
  const editor = usePlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      initialValueIds: "always",
    },
    plugins: EditorKit,
    value: initialValue,
  });
  const sqliteEnabled = usesSQLitePersistence();
  const [persistenceStatus, setPersistenceStatus] =
    React.useState<PersistenceStatus>(
      sqliteEnabled ? "saved" : "browser-preview",
    );
  // This is only a Plate change notification for rebuilding read-only Tana
  // projections. It stores no document data or View result state.
  const [documentRevision, setDocumentRevision] = React.useState(0);
  const saveVersion = React.useRef(0);
  const saveController = React.useMemo(
    () =>
      createDocumentSaveController({
        onStatus: setPersistenceStatus,
        write: savePlateDocument,
      }),
    [],
  );

  const scheduleSave = React.useCallback(
    (value: Value) => {
      if (!sqliteEnabled) {
        void savePlateDocument(value).catch(() => setPersistenceStatus("error"));
        return;
      }

      saveVersion.current += 1;
      saveController.schedule(value);
    },
    [saveController, sqliteEnabled],
  );
  const noteDocumentChange = React.useCallback(() => {
    // TanaIndex is a read-only projection. Keep rebuilding it at a lower
    // priority so a Slate text event can finish its selection/trigger
    // lifecycle before the workspace projection rerenders.
    React.startTransition(() => {
      setDocumentRevision((revision) => revision + 1);
    });
  }, []);

  React.useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    let stopContextRequest: (() => void) | undefined;
    const acknowledgements = new Map<string, TanaCaptureAck>();
    void import("@tauri-apps/api/event")
      .then(async ({ emitTo, listen }) => {
        const stop = await listen<unknown>(
          "f08://capture-submit",
          async (event) => {
            const index = buildTanaIndex(editor.children);
            const payload =
              parseTanaCapturePayload(event.payload, index) ??
              parseLegacyTanaCapturePayload(event.payload);
            if (payload && acknowledgements.has(payload.requestId)) {
              await emitTo("clipper", "f08://capture-ack", acknowledgements.get(payload.requestId));
              return;
            }
            const nodeId = payload
              ? editor.getTransforms(TanaCapturePlugin).capture.commit(payload, {
                  zoom: false,
                  select: false,
                })
              : undefined;
            const acknowledgement: TanaCaptureAck = {
              ok: typeof nodeId === "string",
              requestId: payload?.requestId,
              nodeId,
              error: nodeId ? undefined : "capture commit failed",
            };
            if (payload) acknowledgements.set(payload.requestId, acknowledgement);
            await emitTo("clipper", "f08://capture-ack", acknowledgement);
          },
        );
        const contextRequest = await listen("f08://capture-context-request", async () => {
          await emitTo("clipper", "f08://capture-context", { document: editor.children });
        });
        if (disposed) stop();
        else {
          stopListening = stop;
          stopContextRequest = contextRequest;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      stopListening?.();
      stopContextRequest?.();
    };
  }, [editor]);

  React.useEffect(() => {
    if (!sqliteEnabled) return;

    const flush = () => {
      void saveController.flush().catch(() => setPersistenceStatus("error"));
    };

    window.addEventListener("pagehide", flush);

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const stopListening = await appWindow.onCloseRequested(
          createCloseGuard({
            flush: saveController.flush,
            getVersion: () => saveVersion.current,
            close: () => appWindow.destroy(),
            onError: () => setPersistenceStatus("error"),
          }),
        );

        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => setPersistenceStatus("error"));

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", flush);
      unlisten?.();
      flush();
    };
  }, [saveController, sqliteEnabled]);

  return (
    <Plate
      editor={editor}
      onNodeChange={noteDocumentChange}
      onValueChange={({ value }) => {
        noteDocumentChange();
        scheduleSave(value);
      }}
    >
      <TanaWorkspace
        documentRevision={documentRevision}
        persistenceStatus={persistenceStatus}
      />
    </Plate>
  );
}
