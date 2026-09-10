import type { Path, TElement, Value } from "platejs";

import { isTanaNodeElement } from "./constants";
import { getNodeSemanticTypes } from "./node-semantic";

/**
 * Search definitions belong only to canonical ordinary Nodes.  A View may
 * share that ordinary Node, but structural Nodes and Reference occurrences
 * never own a result-set definition.
 */
export function isTanaSearchHost(
  node: TElement,
  context: { document: Value; path: Path },
): boolean {
  if (!isTanaNodeElement([node, context.path])) return false;

  const tanaNode = node as TElement & { tanaSystemNode?: unknown };
  if (tanaNode.tanaSystemNode !== undefined) return false;

  const semantics = getNodeSemanticTypes(node, context);
  return !semantics.some(
    (semantic) =>
      semantic === "reference" ||
      semantic === "field" ||
      semantic === "value" ||
      semantic === "field-definition" ||
      semantic === "supertag-definition" ||
      semantic === "option",
  );
}
