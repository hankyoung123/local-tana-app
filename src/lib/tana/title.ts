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

function formatFieldValue(index: TanaIndex, value: FieldValue): string {
  switch (value.type) {
    case 'checkbox':
      return value.value ? '已完成' : '未完成';
    case 'from-supertag':
    case 'options':
      return index.nodesById.get(value.value)?.text ?? '';
    default:
      return String(value.value);
  }
}

function getFieldValueText(index: TanaIndex, nodeId: NodeId, name: string): string | undefined {
  const normalizedName = name.trim().toLocaleLowerCase();
  const field = (index.fieldNodesByParent.get(nodeId) ?? []).find((fieldNode) => {
    const definition = index.nodesById.get(fieldNode.fieldId);

    return definition?.text.trim().toLocaleLowerCase() === normalizedName;
  });

  if (!field) return;

  const values = field.values.map((value) => formatFieldValue(index, value)).filter(Boolean);

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

/** Resolves the documented `${name}` / `${Field}` display subset without mutation. */
export function resolveTanaNodeTitle(index: TanaIndex, nodeId: NodeId): string {
  const node = index.nodesById.get(nodeId);
  const expression = node?.titleExpression;

  if (!node || expression === undefined || expression.length === 0) return node?.text ?? '';

  return expression.replace(/\$\{([^}]+)\}/g, (token, descriptor: string) => {
    const [rawFieldName, limit] = descriptor.split('|', 2);
    const fieldName = rawFieldName.trim();
    const showsPlaceholder = fieldName.endsWith('?');
    const lookupName = showsPlaceholder ? fieldName.slice(0, -1).trim() : fieldName;
    const value =
      lookupName === 'name'
        ? node.rawText
        : getFieldValueText(index, node.id, lookupName);

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
