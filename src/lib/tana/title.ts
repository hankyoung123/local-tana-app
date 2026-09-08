import type { FieldValue, NodeId, TanaIndex, TanaNode } from './types';

/**
 * A title expression is presentation derived from canonical Nodes. It never
 * writes computed text back into the Plate document or into the TanaIndex.
 */
export function getTanaTitleExpression(
  index: TanaIndex,
  nodeId: NodeId
): string | undefined {
  return index.nodesById.get(nodeId)?.titleExpression;
}

/** `${name}`-first expressions keep the canonical title editing affordance. */
export function isTanaTitleExpressionNameEditable(expression: string | undefined): boolean {
  return expression?.trim().startsWith('${name}') ?? false;
}

function formatFieldValue(
  index: TanaIndex,
  value: FieldValue,
  resolving: ReadonlySet<NodeId>
): string {
  switch (value.type) {
    case 'checkbox':
      return value.value ? '已完成' : '未完成';
    case 'from-supertag':
    case 'options':
      return index.nodesById.has(value.value)
        ? resolveTanaNodeTitleInternal(index, value.value, resolving)
        : '';
    default:
      return String(value.value);
  }
}

function getFieldValueText(
  index: TanaIndex,
  nodeId: NodeId,
  name: string,
  resolving: ReadonlySet<NodeId>
): string | undefined {
  const normalizedName = name.trim().toLocaleLowerCase();
  const field = (index.fieldNodesByParent.get(nodeId) ?? []).find((fieldNode) => {
    const definition = index.nodesById.get(fieldNode.fieldId);

    return definition?.text.trim().toLocaleLowerCase() === normalizedName;
  });

  if (!field) return;

  const values = field.values
    .map((value) => formatFieldValue(index, value, resolving))
    .filter(Boolean);

  return values.length > 0 ? values.join(', ') : undefined;
}

function applyLimit(value: string, limit: string | undefined): string {
  if (!limit) return value;

  const match = limit.match(/^(\d+)(.*)$/);

  if (!match) return value;

  const max = Number(match[1]);

  if (!Number.isSafeInteger(max) || max < 0 || value.length <= max) return value;

  return `${value.slice(0, max)}${match[2] || '…'}`;
}

function getSystemAttribute(
  index: TanaIndex,
  node: TanaNode,
  name: string,
  resolving: ReadonlySet<NodeId>
): string | undefined {
  const raw = node.node as TanaNode['node'] & Record<string, unknown>;

  switch (name) {
    case 'owner': {
      const ownerId = index.parentNodeIds.get(node.id);
      return ownerId ? resolveTanaNodeTitleInternal(index, ownerId, resolving) : undefined;
    }
    case 'doneTime':
      return typeof raw.tanaDoneTime === 'string' ? raw.tanaDoneTime : undefined;
    case 'created':
    case 'createdAt':
      return typeof raw.tanaCreatedAt === 'string' ? raw.tanaCreatedAt : undefined;
    case 'modified':
    case 'modifiedAt':
      return typeof raw.tanaModifiedAt === 'string' ? raw.tanaModifiedAt : undefined;
    default:
      return undefined;
  }
}

/** Resolves the documented `${name}` / `${Field}` display subset without mutation. */
export function resolveTanaNodeTitle(index: TanaIndex, nodeId: NodeId): string {
  return resolveTanaNodeTitleInternal(index, nodeId, new Set());
}

function resolveTanaNodeTitleInternal(
  index: TanaIndex,
  nodeId: NodeId,
  resolving: ReadonlySet<NodeId>
): string {
  const node = index.nodesById.get(nodeId);
  const expression = node?.titleExpression;

  if (!node || expression === undefined || expression.length === 0) return node?.text ?? '';

  if (resolving.has(nodeId)) return node.rawText;

  const nextResolving = new Set(resolving).add(nodeId);

  return expression.replace(/\$\{([^}]+)\}/g, (token, descriptor: string) => {
    const [rawFieldName, rawLimit] = descriptor.split('|', 2);
    const fieldName = rawFieldName.trim();
    const limitHasPlaceholder = rawLimit?.endsWith('?') ?? false;
    const limit = limitHasPlaceholder ? rawLimit!.slice(0, -1) : rawLimit;
    const showsPlaceholder = fieldName.endsWith('?') || limitHasPlaceholder;
    const lookupName = fieldName.endsWith('?')
      ? fieldName.slice(0, -1).trim()
      : fieldName;
    const value = lookupName === 'name'
      ? node.rawText
      : lookupName.startsWith('sys:')
        ? getSystemAttribute(index, node, lookupName.slice(4).trim(), nextResolving)
        : getFieldValueText(index, node.id, lookupName, nextResolving);

    if (value === undefined || value.length === 0) {
      return showsPlaceholder ? token : '';
    }

    return applyLimit(value, limit);
  });
}

/** Used by renderers that need both the canonical Node and its derived title. */
export function getTanaNodeTitle(index: TanaIndex, node: TanaNode): string {
  return resolveTanaNodeTitle(index, node.id);
}
