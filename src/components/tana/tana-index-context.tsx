'use client';

import * as React from 'react';

import { useEditorSelector } from 'platejs/react';

import { buildTanaIndex, type TanaIndex } from '@/lib/tana';

const TanaIndexContext = React.createContext<TanaIndex | null>(null);

/**
 * A read-only cache of the one semantic projection from the Plate document.
 * It deliberately exposes no setter: the editor document remains the source
 * of truth and every document change rebuilds this value in full.
 */
export function TanaIndexProvider({ children }: React.PropsWithChildren) {
  const index = useEditorSelector(
    (editor) => buildTanaIndex(editor.children),
    []
  );

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
