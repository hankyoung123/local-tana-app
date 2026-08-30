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
  usesSQLitePersistence,
} from '@/lib/tana';
import { initialDocument } from '@/lib/tana/initial-document';

export function PlateEditor() {
  const [loadedDocument, setLoadedDocument] = React.useState<Value>();
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    loadPlateDocument(initialDocument)
      .then((document) => {
        if (!cancelled) setLoadedDocument(document);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setLoadedDocument(structuredClone(initialDocument));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loadedDocument) {
    return (
      <div className="grid h-dvh place-items-center bg-[#f4f6f5] text-muted-foreground text-sm">
        Loading workspace…
      </div>
    );
  }

  return (
    <LoadedPlateEditor
      initialValue={loadedDocument}
      initialLoadFailed={loadError}
    />
  );
}

function LoadedPlateEditor({
  initialLoadFailed,
  initialValue,
}: {
  initialLoadFailed: boolean;
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
      initialLoadFailed
        ? 'error'
        : sqliteEnabled
          ? 'saved'
          : 'browser-preview'
    );
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
      const stopListening = await appWindow.onCloseRequested(async (event) => {
        try {
          await saveController.flush();
        } catch {
          event.preventDefault();
          setPersistenceStatus('error');
        }
      });

      if (disposed) stopListening();
      else unlisten = stopListening;
    });

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
