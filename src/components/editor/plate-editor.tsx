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
    nodeId: true,
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
  const saveTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleSave = React.useCallback(
    (value: Value) => {
      if (!sqliteEnabled) return;

      setPersistenceStatus('saving');
      clearTimeout(saveTimer.current);
      const snapshot = structuredClone(value);

      saveTimer.current = setTimeout(() => {
        savePlateDocument(snapshot)
          .then(() => setPersistenceStatus('saved'))
          .catch(() => setPersistenceStatus('error'));
      }, 300);
    },
    [sqliteEnabled]
  );

  React.useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
    },
    []
  );

  return (
    <Plate editor={editor} onValueChange={({ value }) => scheduleSave(value)}>
      <TanaWorkspace persistenceStatus={persistenceStatus} />
    </Plate>
  );
}
