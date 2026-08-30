'use client';

import * as React from 'react';

import type { NodeId } from '@/lib/tana';

/**
 * UI dependency injection for Workspace navigation actions. Zoom state itself
 * stays exclusively in the Plate TanaZoomPlugin option store.
 */
export type TanaNavigation = {
  navigateToNode: (nodeId: NodeId) => void;
  zoomOut: () => void;
  zoomToNode: (nodeId: NodeId) => void;
};

const TanaNavigationContext = React.createContext<TanaNavigation | null>(null);

export function TanaNavigationProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: TanaNavigation }>) {
  return (
    <TanaNavigationContext.Provider value={value}>
      {children}
    </TanaNavigationContext.Provider>
  );
}

export function useTanaNavigation() {
  return React.useContext(TanaNavigationContext);
}
