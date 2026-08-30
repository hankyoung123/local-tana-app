import { KEYS } from 'platejs';

import type { Path, TElement } from 'platejs';

export const TANA_NODE_TYPES = [
  KEYS.p,
  KEYS.toggle,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.blockquote,
] as const;

export const TANA_SUPERTAG_KEY = 'tana_supertag';
export const TANA_SUPERTAG_INPUT_KEY = 'tana_supertag_input';

/** Tana nodes are flat, top-level outliner blocks in the Plate document. */
export function isTanaNodeElement(element: TElement, path: Path): boolean {
  return (
    path.length === 1 &&
    TANA_NODE_TYPES.includes(
      element.type as (typeof TANA_NODE_TYPES)[number]
    )
  );
}
