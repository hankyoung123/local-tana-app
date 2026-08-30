'use client';

import * as React from 'react';

import type { NodeId } from '@/lib/tana';

/**
 * UI dependency injection for the Workspace-owned Zoom state. This provider
 * stores no document, hierarchy, or selection state; descendants only receive
 * the single NodeId and the three Workspace navigation actions.
 */
export type TanaNavigation = {
  focusedNodeId: NodeId | null;
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
