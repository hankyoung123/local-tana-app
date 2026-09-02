import type { TElement } from 'platejs';

import {
  getNodeSemanticType,
  getNodeSemanticTypes,
  type TanaNodeSemanticContext,
  type TanaNodeSemanticType,
} from './node-semantic';

export type TanaNodeContextAction =
  | 'collapse'
  | 'delete'
  | 'edit'
  | 'edit-schema'
  | 'move'
  | 'navigate'
  | 'open-definition';

export type TanaNodeBehavior = {
  canDelete: boolean;
  canDrag: boolean;
  canEdit: boolean;
  canNavigate: boolean;
  contextActions: readonly TanaNodeContextAction[];
};

const NODE_BEHAVIORS: Record<TanaNodeSemanticType, TanaNodeBehavior> = {
  command: { canDelete: true, canDrag: false, canEdit: true, canNavigate: false, contextActions: ['edit', 'delete'] },
  content: { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'move', 'delete', 'collapse'] },
  'field-definition': { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'edit-schema', 'move', 'delete'] },
  field: { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'open-definition', 'move', 'delete'] },
  option: { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'move', 'delete'] },
  reference: { canDelete: true, canDrag: false, canEdit: false, canNavigate: true, contextActions: ['navigate', 'delete'] },
  search: { canDelete: false, canDrag: false, canEdit: false, canNavigate: true, contextActions: ['navigate'] },
  'supertag-definition': { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'edit-schema', 'move', 'delete'] },
  value: { canDelete: true, canDrag: false, canEdit: true, canNavigate: true, contextActions: ['edit', 'navigate'] },
  view: { canDelete: true, canDrag: true, canEdit: true, canNavigate: true, contextActions: ['edit', 'move', 'delete'] },
};

export function getNodeBehavior(
  node: TElement,
  context: TanaNodeSemanticContext = {}
): TanaNodeBehavior {
  return NODE_BEHAVIORS[getNodeSemanticType(node, context)];
}

export function canEdit(node: TElement, context: TanaNodeSemanticContext = {}): boolean {
  return getNodeBehavior(node, context).canEdit;
}

export function canDelete(node: TElement, context: TanaNodeSemanticContext = {}): boolean {
  return getNodeBehavior(node, context).canDelete;
}

export function canDrag(node: TElement, context: TanaNodeSemanticContext = {}): boolean {
  return getNodeBehavior(node, context).canDrag;
}

export function canDrop(
  node: TElement,
  target: TElement,
  context: TanaNodeSemanticContext = {},
  targetContext: TanaNodeSemanticContext = {}
): boolean {
  const sourceTypes = getNodeSemanticTypes(node, context);
  const targetTypes = getNodeSemanticTypes(target, targetContext);

  if (sourceTypes.includes('value')) return false;
  if (targetTypes.includes('field') || targetTypes.includes('value')) return false;

  if (sourceTypes.includes('field')) {
    return !targetTypes.includes('field-definition');
  }

  return true;
}

export function canNavigate(node: TElement, context: TanaNodeSemanticContext = {}): boolean {
  return getNodeBehavior(node, context).canNavigate;
}

export function getContextActions(
  node: TElement,
  context: TanaNodeSemanticContext = {}
): readonly TanaNodeContextAction[] {
  return getNodeBehavior(node, context).contextActions;
}
