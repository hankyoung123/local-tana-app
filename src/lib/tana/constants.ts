import { ElementApi } from 'platejs';

import type { NodeEntry, Path, TElement } from 'platejs';

export const TANA_SUPERTAG_KEY = 'tana_supertag';
export const TANA_SUPERTAG_INPUT_KEY = 'tana_supertag_input';

/**
 * The single Local Tana node boundary: a top-level Plate block element.
 *
 * A Plate type controls presentation and editing behavior only. In particular,
 * `toggle` is not part of node identity. Plate's NodeId plugin additionally
 * applies its official block/inline guards before calling this predicate.
 */
export function isTanaNodeElement(entry: NodeEntry): boolean;
export function isTanaNodeElement(element: TElement, path: Path): boolean;
export function isTanaNodeElement(
  elementOrEntry: NodeEntry | TElement,
  possiblePath?: Path
): boolean {
  const [node, path] = Array.isArray(elementOrEntry)
    ? elementOrEntry
    : [elementOrEntry, possiblePath];

  return ElementApi.isElement(node) && path?.length === 1;
}
