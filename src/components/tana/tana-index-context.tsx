'use client';

import * as React from 'react';

import { useEditorRef } from 'platejs/react';

import { buildTanaIndex, type TanaIndex } from '@/lib/tana';

const TanaIndexContext = React.createContext<TanaIndex | null>(null);

/**
 * A read-only cache of the one semantic projection from the Plate document.
 * It deliberately exposes no setter: the editor document remains the source
 * of truth and every document change rebuilds this value in full.
 */
export function TanaIndexProvider({ children, revision = 0 }: React.PropsWithChildren<{ revision?: number }>) {
  const editor = useEditorRef();
  // Plate's stored value is an initial snapshot for metadata-only Slate
  // operations. Rebuild from the live editor document whenever the root
  // receives a document-change notification; this remains a read-only view.
  const index = React.useMemo(() => {
    void revision;
    return buildTanaIndex(editor.children);
  }, [editor, revision]);

  return (
    <TanaIndexContext.Provider value={index}>
      {children}
    </TanaIndexContext.Provider>
  );
}

export function useTanaIndex(): TanaIndex {
  const index = React.useContext(TanaIndexContext);

  if (!index) {
    throw new Error('useTanaIndex must be used within TanaIndexProvider');
  }

  return index;
}
