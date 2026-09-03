import type {
  FieldDefinition,
  FieldId,
  TanaIndex,
  TanaNode,
  TanaQueryClause,
  TanaQueryExpression,
  TanaQueryPredicate,
} from './types';
import { isFieldDefined, isFieldValueValid } from './fields';
import { isTanaNodeInTrash } from './index';

export function getFieldDefinition(index: TanaIndex, fieldId: FieldId): FieldDefinition | undefined {
  const node = index.nodesById.get(fieldId);

  return node?.semanticTypes.includes('field-definition') ? node.fieldDefinition : undefined;
}

export function getFieldDisplayName(index: TanaIndex, fieldId: FieldId): string {
  return index.nodesById.get(fieldId)?.text || fieldId;
}

/** The empty root preserves v1's established "show every Node" Search. */
export function createAndQuery(
  predicates: readonly TanaQueryPredicate[] = []
): TanaQueryExpression {
  return {
    children: predicates.map((predicate) => ({ predicate, type: 'predicate' })),
    type: 'and',
  };
}

/** Validates one leaf against the current derived document graph. */
export function isTanaQueryPredicateValid(
  index: TanaIndex,
  predicate: TanaQueryPredicate
): boolean {
  switch (predicate.kind) {
    case 'has-supertag':
      return index.nodesById.get(predicate.supertagId)?.semanticTypes.includes('supertag-definition') ?? false;
    case 'field-defined':
    case 'field-exists':
      return !!getFieldDefinition(index, predicate.fieldId);
    case 'field-equals':
      return isFieldValueValid(index, predicate.fieldId, predicate.value);
    case 'text-contains':
      return predicate.text.trim().length > 0;
    case 'parent-is':
    case 'child-of':
    case 'descendant-of':
    case 'references':
    case 'referenced-by':
      return index.nodesById.has(predicate.nodeId);
  }
}

/** Backward-named leaf helper kept for the existing basic predicate editor. */
export function isTanaQueryClauseValid(
  index: TanaIndex,
  clause: TanaQueryClause
): boolean {
  return isTanaQueryPredicateValid(index, clause);
}

export function isTanaQueryExpressionValid(
  index: TanaIndex,
  expression: TanaQueryExpression
): boolean {
  switch (expression.type) {
    case 'predicate':
      return isTanaQueryPredicateValid(index, expression.predicate);
    case 'not':
      return isTanaQueryExpressionValid(index, expression.child);
    case 'and':
    case 'or':
      return expression.children.every((child) => isTanaQueryExpressionValid(index, child));
  }
}

export function describeTanaQueryClause(
  index: TanaIndex,
  clause: TanaQueryPredicate
): string {
  switch (clause.kind) {
    case 'field-equals':
      return `${getFieldDisplayName(index, clause.fieldId)} 等于 ${String(clause.value.value)}`;
    case 'field-defined':
      return `${getFieldDisplayName(index, clause.fieldId)} 已定义`;
    case 'field-exists':
      return `${getFieldDisplayName(index, clause.fieldId)} 已设置`;
    case 'has-supertag':
      return `包含 #${index.nodesById.get(clause.supertagId)?.text ?? clause.supertagId}`;
    case 'text-contains':
      return `文本包含“${clause.text}”`;
    case 'parent-is':
      return `父节点是 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId}`;
    case 'child-of':
      return `子节点包含 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId}`;
    case 'descendant-of':
      return `属于 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 的后代`;
    case 'references':
      return `引用 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId}`;
    case 'referenced-by':
      return `被 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 引用`;
  }
}

function fieldValuesEqual(
  predicate: Extract<TanaQueryPredicate, { kind: 'field-equals' }>,
  node: TanaNode,
  index: TanaIndex
) {
  const actual = index.fieldValues.get(node.id)?.get(predicate.fieldId);

  return actual?.type === predicate.value.type && actual.value === predicate.value.value;
}

function isDescendantOf(index: TanaIndex, nodeId: string, ancestorId: string): boolean {
  let parentId = index.parentNodeIds.get(nodeId);

  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = index.parentNodeIds.get(parentId);
  }

  return false;
}

export function matchesTanaQueryPredicate(
  node: TanaNode,
  index: TanaIndex,
  predicate: TanaQueryPredicate
): boolean {
  switch (predicate.kind) {
    case 'field-equals':
      return fieldValuesEqual(predicate, node, index);
    case 'field-defined':
      return isFieldDefined(index, node.id, predicate.fieldId);
    case 'field-exists':
      return index.fieldValues.get(node.id)?.get(predicate.fieldId) != null;
    case 'has-supertag':
      return index.nodesBySupertag.get(predicate.supertagId)?.includes(node.id) ?? false;
    case 'text-contains':
      return node.text.toLocaleLowerCase().includes(predicate.text.trim().toLocaleLowerCase());
    case 'parent-is':
      return index.parentNodeIds.get(node.id) === predicate.nodeId;
    case 'child-of':
      return index.childrenByParent.get(node.id)?.includes(predicate.nodeId) ?? false;
    case 'descendant-of':
      return isDescendantOf(index, node.id, predicate.nodeId);
    case 'references':
      return index.references.some(
        (reference) => reference.sourceNodeId === node.id && reference.targetNodeId === predicate.nodeId
      );
    case 'referenced-by':
      return index.backlinks.get(node.id)?.some(
        (reference) => reference.sourceNodeId === predicate.nodeId
      ) ?? false;
  }
}

export function matchesTanaQueryExpression(
  node: TanaNode,
  index: TanaIndex,
  expression: TanaQueryExpression
): boolean {
  switch (expression.type) {
    case 'predicate':
      return matchesTanaQueryPredicate(node, index, expression.predicate);
    case 'not':
      return !matchesTanaQueryExpression(node, index, expression.child);
    case 'and':
      return expression.children.every((child) => matchesTanaQueryExpression(node, index, child));
    case 'or':
      return expression.children.some((child) => matchesTanaQueryExpression(node, index, child));
  }
}

/** Runs a persisted Search AST exclusively from the read-only derived index. */
export function runTanaQuery(index: TanaIndex, expression: TanaQueryExpression): TanaNode[] {
  return Array.from(index.nodesById.values()).filter(
    (node) =>
      !isTanaNodeInTrash(index, node.id) &&
      matchesTanaQueryExpression(node, index, expression)
  );
}
