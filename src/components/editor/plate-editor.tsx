'use client';

import * as React from 'react';

import type { Value } from 'platejs';

import { Plate, usePlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import {
  type PersistenceStatus,
  TanaWorkspace,
} from '@/components/tana/tana-workspace';
import {
  createDocumentSaveController,
  isTanaNodeElement,
  loadPlateDocument,
  savePlateDocument,
  resetPlateDocument,
  usesSQLitePersistence,
} from '@/lib/tana';
import { createCloseGuard } from '@/lib/tana/close-guard';
import { initialDocument } from '@/lib/tana/initial-document';

export function PlateEditor() {
  const [loadedDocument, setLoadedDocument] = React.useState<Value>();
  const [loadError, setLoadError] = React.useState<string>();
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    loadPlateDocument(initialDocument)
      .then((document) => {
        if (!cancelled) setLoadedDocument(document);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return <main className="grid h-dvh place-content-center gap-4 p-8" role="alert">
      <h1 className="text-xl font-semibold">工作区加载失败</h1>
      <p>{loadError}</p>
      <p>工作区未打开。可重试，或确认清空当前工作区后重新开始。</p>
      <button onClick={() => { setLoadError(undefined); setAttempt((value) => value + 1); }}>重试</button>
      <button onClick={async () => {
        if (!window.confirm('永久清空当前工作区并重置？此操作无法撤销。')) return;
        setLoadError(undefined);
        try {
          await resetPlateDocument(initialDocument);
          setLoadError(undefined);
          setAttempt((value) => value + 1);
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }}>清空并重置工作区…</button>
    </main>;
  }

  if (!loadedDocument) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6f5] text-muted-foreground text-sm">
        正在加载工作区…
      </div>
    );
  }

  return (
    <LoadedPlateEditor
      initialValue={loadedDocument}
    />
  );
}

function LoadedPlateEditor({
  initialValue,
}: {
  initialValue: Value;
}) {
  const editor = usePlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value: initialValue,
  });
  const sqliteEnabled = usesSQLitePersistence();
  const [persistenceStatus, setPersistenceStatus] =
    React.useState<PersistenceStatus>(
      sqliteEnabled ? 'saved' : 'browser-preview'
    );
  const saveVersion = React.useRef(0);
  const saveController = React.useMemo(
    () =>
      createDocumentSaveController({
        onStatus: setPersistenceStatus,
        write: savePlateDocument,
      }),
    []
  );

  const scheduleSave = React.useCallback(
    (value: Value) => {
      if (!sqliteEnabled) return;

      saveVersion.current += 1;
      saveController.schedule(value);
    },
    [saveController, sqliteEnabled]
  );

  React.useEffect(() => {
    if (!sqliteEnabled) return;

    const flush = () => {
      void saveController.flush().catch(() => setPersistenceStatus('error'));
    };

    window.addEventListener('pagehide', flush);

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      const stopListening = await appWindow.onCloseRequested(createCloseGuard({
        flush: saveController.flush,
        getVersion: () => saveVersion.current,
        close: () => appWindow.destroy(),
        onError: () => setPersistenceStatus('error'),
      }));

      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => setPersistenceStatus('error'));

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', flush);
      unlisten?.();
      flush();
    };
  }, [saveController, sqliteEnabled]);

  return (
    <Plate editor={editor} onValueChange={({ value }) => scheduleSave(value)}>
      <TanaWorkspace persistenceStatus={persistenceStatus} />
    </Plate>
  );
}
