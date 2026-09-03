import type { Path, TElement, Value } from 'platejs';

import { getTanaParentPath } from './outliner';
import type { TanaBlockElement } from './types';

export const TANA_NODE_SEMANTIC_TYPES = [
  'content',
  'field-definition',
  'field',
  'value',
  'supertag-definition',
  'view',
  'option',
  'reference',
  'search',
] as const;

export type TanaNodeSemanticType =
  (typeof TANA_NODE_SEMANTIC_TYPES)[number];

export type TanaNodeSemanticContext = {
  /** Required only for hierarchy-derived semantics such as `option`. */
  document?: Value;
  path?: Path;
};

function isOptionNode(
  node: TanaBlockElement,
  context: TanaNodeSemanticContext
): boolean {
  if (!context.document || !context.path) return false;

  const parentPath = getTanaParentPath(context.document, context.path);
  const parent = parentPath ? context.document[parentPath[0]] : undefined;

  return (
    !!parent &&
    'children' in parent &&
    Array.isArray(parent.children) &&
    (parent as TanaBlockElement).tanaFieldDefinition?.type === 'options' &&
    node.tanaFieldDefinition === undefined &&
    node.tanaFieldId === undefined &&
    node.tanaFieldValueType === undefined
  );
}

/**
 * Returns every composable semantic carried by a Plate element. The document
 * remains the only source: metadata identifies semantics and flat hierarchy
 * identifies Options. Inline references and transient command inputs remain
 * Plate elements rather than Tana Node semantics.
 */
export function getNodeSemanticTypes(
  node: TElement,
  context: TanaNodeSemanticContext = {}
): readonly TanaNodeSemanticType[] {
  const tanaNode = node as TanaBlockElement;
  const types: TanaNodeSemanticType[] = [];

  if (tanaNode.tanaFieldValueType !== undefined) types.push('value');
  if (tanaNode.tanaFieldId !== undefined) types.push('field');
  if (tanaNode.tanaFieldDefinition !== undefined) types.push('field-definition');
  if (tanaNode.tanaSupertagDefinition !== undefined) {
    types.push('supertag-definition');
  }
  if (tanaNode.tanaReferenceTargetId !== undefined) types.push('reference');
  if (tanaNode.tanaSearchDefinition !== undefined) types.push('search');
  if (tanaNode.tanaViewDefinition !== undefined) types.push('view');
  if (isOptionNode(tanaNode, context)) types.push('option');

  return types.length > 0 ? types : ['content'];
}

/**
 * Selects the display/interaction owner while preserving composable semantic
 * facts through `getNodeSemanticTypes`. View precedence intentionally matches
 * the established View → Supertag Instances → Outline host behavior.
 */
export function getNodeSemanticType(
  node: TElement,
  context: TanaNodeSemanticContext = {}
): TanaNodeSemanticType {
  const types = getNodeSemanticTypes(node, context);
  const priority: readonly TanaNodeSemanticType[] = [
    'view',
    'search',
    'reference',
    'supertag-definition',
    'field-definition',
    'field',
    'value',
    'option',
    'content',
  ];

  return priority.find((type) => types.includes(type)) ?? 'content';
}

export function hasNodeSemantic(
  node: TElement,
  semantic: TanaNodeSemanticType,
  context: TanaNodeSemanticContext = {}
): boolean {
  return getNodeSemanticTypes(node, context).includes(semantic);
}
