'use client';

import * as React from 'react';

import type { NodeId } from '@/lib/tana';

/** A shell action, never a second editor or node store. */
export const TanaInspectorContext = React.createContext<
  ((nodeId: NodeId) => void) | null
>(null);

export const useTanaInspector = () => React.useContext(TanaInspectorContext);
