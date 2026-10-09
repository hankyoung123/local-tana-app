'use client';

import * as React from 'react';

export type StillAppearance = 'system' | 'light' | 'dark';
const storageKey = 'still-appearance';
const changeEvent = 'still-appearance-change';
let sessionAppearance: StillAppearance = 'system';

function readAppearance(): StillAppearance {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : sessionAppearance;
  } catch { return sessionAppearance; }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

/** Appearance is local presentation state, independent of the Plate document. */
export function useStillAppearance() {
  const appearance = React.useSyncExternalStore(subscribe, readAppearance, () => 'system' as const);

  React.useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    return () => { delete document.documentElement.dataset.appearance; };
  }, [appearance]);

  const changeAppearance = React.useCallback((next: StillAppearance) => {
    sessionAppearance = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Session-only preference. */ }
    window.dispatchEvent(new Event(changeEvent));
  }, []);

  return { appearance, changeAppearance };
}
