'use client';

import * as React from 'react';

const TanaZoomPresentationContext = React.createContext<{
  baseIndent: number;
}>({
  baseIndent: 0,
});

/**
 * A read-only presentation coordinate supplied by the current Zoom page.
 * It derives from the existing focused Node and never mirrors document state.
 */
export function TanaZoomPresentationProvider({
  baseIndent,
  children,
}: {
  baseIndent: number;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ baseIndent }), [baseIndent]);

  return (
    <TanaZoomPresentationContext.Provider value={value}>
      {children}
    </TanaZoomPresentationContext.Provider>
  );
}

export function useTanaZoomPresentation() {
  return React.useContext(TanaZoomPresentationContext);
}
