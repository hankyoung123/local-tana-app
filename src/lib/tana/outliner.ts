import type { Path, TElement, Value } from 'platejs';

import { KEYS } from 'platejs';

import { isTanaNodeElement } from './constants';

function getIndent(element: TElement): number {
  return typeof element.indent === 'number' ? element.indent : 0;
}

function isElement(value: Value[number]): value is TElement {
  return 'children' in value && Array.isArray(value.children);
}

/**
 * Finds ordinary top-level Tana nodes that own a nested outliner subtree.
 * Plate Toggle remains responsible for openIds and hiding descendants.
 */
export function getTanaParentPaths(document: Value): Path[] {
  const paths: Path[] = [];

  for (let index = 0; index < document.length - 1; index += 1) {
    const current = document[index];
    const next = document[index + 1];

    if (!isElement(current) || !isElement(next)) continue;
    if (!isTanaNodeElement(current, [index])) continue;
    if (!isTanaNodeElement(next, [index + 1])) continue;

    if (getIndent(next) > getIndent(current)) paths.push([index]);
  }

  return paths;
}

/** Only paragraph nodes need promotion; existing Plate toggles remain untouched. */
export function getOrdinaryTanaParentPaths(document: Value): Path[] {
  return getTanaParentPaths(document).filter(
    ([index]) => document[index]?.type === KEYS.p
  );
}
