/**
 * Shared presentation geometry for the canonical flat-indent outliner.
 * These values never participate in document hierarchy or Plate transforms.
 */
export const TANA_INDENT_PX = 24;
export const TANA_GUTTER_PX = 60;
export const TANA_FIELD_LABEL_PX = 100;
export const TANA_FIELD_VALUE_GAP_PX = 8;

export function getTanaDisplayIndent(
  nodeIndent: unknown,
  baseIndent: unknown = 0
): number {
  const nodeLevel = typeof nodeIndent === 'number' ? nodeIndent : 0;
  const baseLevel = typeof baseIndent === 'number' ? baseIndent : 0;

  return Math.max(0, nodeLevel - baseLevel);
}

export function getTanaDisplayIndentPx(
  nodeIndent: unknown,
  baseIndent: unknown = 0
): number {
  return getTanaDisplayIndent(nodeIndent, baseIndent) * TANA_INDENT_PX;
}
