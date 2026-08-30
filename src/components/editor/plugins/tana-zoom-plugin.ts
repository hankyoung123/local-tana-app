'use client';

import { createPlatePlugin } from 'platejs/react';

import type { NodeId } from '@/lib/tana/types';

export const TANA_ZOOM_PLUGIN_KEY = 'tanaZoom' as const;

/**
 * Plate owns the sole Zoom state. The low priority makes its Escape transform
 * the final fallback after Plate's own higher-priority UI has declined it.
 */
export const TanaZoomPlugin = createPlatePlugin<
  typeof TANA_ZOOM_PLUGIN_KEY,
  { focusedNodeId: NodeId | null }
>({
  key: TANA_ZOOM_PLUGIN_KEY,
  options: {
    focusedNodeId: null,
  },
  priority: 0,
});
