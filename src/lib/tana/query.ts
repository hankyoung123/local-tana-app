import {
  createTanaQueryRegExp,
  isTanaQueryAst,
  isTanaQueryPredicateAst,
} from './query-ast';
import type {
  FieldDefinition,
  FieldId,
  FieldValue,
  NodeId,
  TanaIndex,
  TanaNode,
  TanaQueryExpression,
  TanaQueryPredicate,
} from './types';
import { isFieldDefined, isFieldValueCompatible } from './fields';
import { getTanaProjectionTarget, isTanaNodeActive } from './index';

type FieldComparisonPredicate = {
  fieldId: FieldId;
  kind: 'field-equals' | 'field-greater-than' | 'field-less-than';
  value: FieldValue;
};

export type TanaQueryDiagnostic = {
  code:
    | 'incompatible-field-value'
    | 'invalid-ast'
    | 'missing-field'
    | 'missing-node'
    | 'missing-supertag'
    | 'noncanonical-node-target';
  predicate?: TanaQueryPredicate;
};

export function getFieldDefinition(
  index: TanaIndex,
  fieldId: FieldId,
): FieldDefinition | undefined {
  const node = index.nodesById.get(fieldId);
  return node?.semanticTypes.includes('field-definition')
    ? node.fieldDefinition
    : undefined;
}

export function getFieldDisplayName(index: TanaIndex, fieldId: FieldId): string {
  return index.nodesById.get(fieldId)?.text || fieldId;
}

/** The empty root preserves the established “show every Node” Search. */
export function createAndQuery(
  predicates: readonly TanaQueryPredicate[] = [],
): TanaQueryExpression {
  return {
    children: predicates.map((predicate) => ({ predicate, type: 'predicate' })),
    type: 'and',
  };
}

/** Search Nodes always persist a stable AND wrapper around their real root. */
export function normalizeTanaQueryRoot(query: TanaQueryExpression): TanaQueryExpression {
  return query.type === 'and'
    ? query
    : { children: [query], type: 'and' };
}

function activeFieldDefinition(index: TanaIndex, fieldId: FieldId) {
  const field = getFieldDefinition(index, fieldId);
  return field && isTanaNodeActive(index, fieldId) ? field : undefined;
}

function diagnosePredicate(
  index: TanaIndex,
  predicate: TanaQueryPredicate,
): TanaQueryDiagnostic | undefined {
  if (!isTanaQueryPredicateAst(predicate)) return { code: 'invalid-ast' };

  switch (predicate.kind) {
    case 'has-supertag':
    case 'has-tag': {
      const node = index.nodesById.get(predicate.supertagId);
      return node && isTanaNodeActive(index, node.id) &&
          node.semanticTypes.includes('supertag-definition')
        ? undefined
        : { code: 'missing-supertag', predicate };
    }
    case 'field-defined':
    case 'field-exists':
    case 'has-field':
      return activeFieldDefinition(index, predicate.fieldId)
        ? undefined
        : { code: 'missing-field', predicate };
    case 'field-equals':
    case 'field-greater-than':
    case 'field-less-than': {
      const field = activeFieldDefinition(index, predicate.fieldId);
      if (!field) return { code: 'missing-field', predicate };
      if (!isFieldValueCompatible(field, predicate.value) ||
        ((predicate.kind === 'field-greater-than' || predicate.kind === 'field-less-than') &&
          predicate.value.type !== 'number' && predicate.value.type !== 'date')) {
        return { code: 'incompatible-field-value', predicate };
      }
      if (predicate.value.type === 'options' || predicate.value.type === 'from-supertag') {
        const target = getTanaProjectionTarget(index, predicate.value.value);
        if (!target) return { code: 'missing-node', predicate };
        if (target.id !== predicate.value.value) {
          return { code: 'noncanonical-node-target', predicate };
        }
      }
      return undefined;
    }
    case 'text-contains':
    case 'text-matches-regex':
    case 'done-state':
    case 'date-is':
    case 'is-semantic':
      return undefined;
    case 'child-of':
    case 'descendant-of':
    case 'grandchild-of':
    case 'references':
    case 'referenced-by': {
      const target = getTanaProjectionTarget(index, predicate.nodeId);
      if (!target) return { code: 'missing-node', predicate };
      return target.id === predicate.nodeId
        ? undefined
        : { code: 'noncanonical-node-target', predicate };
    }
  }
}

/**
 * Resolves only persisted NodeIds and Field compatibility. It never writes or
 * prunes the AST: a temporarily broken query remains historical document data.
 */
export function diagnoseTanaQuery(
  index: TanaIndex,
  expression: unknown,
): readonly TanaQueryDiagnostic[] {
  if (!isTanaQueryAst(expression)) return [{ code: 'invalid-ast' }];

  const diagnostics: TanaQueryDiagnostic[] = [];
  const visit = (current: TanaQueryExpression) => {
    switch (current.type) {
      case 'predicate': {
        const diagnostic = diagnosePredicate(index, current.predicate);
        if (diagnostic) diagnostics.push(diagnostic);
        return;
      }
      case 'not':
        visit(current.child);
        return;
      case 'and':
      case 'or':
        current.children.forEach(visit);
    }
  };
  visit(expression);
  return diagnostics;
}

/** Validates one leaf against both the AST grammar and current derived graph. */
export function isTanaQueryPredicateValid(
  index: TanaIndex,
  predicate: TanaQueryPredicate,
): boolean {
  return !diagnosePredicate(index, predicate);
}

/** Semantic validity is for diagnostics only; writers retain structurally valid broken queries. */
export function isTanaQueryExpressionValid(
  index: TanaIndex,
  expression: TanaQueryExpression,
): boolean {
  return diagnoseTanaQuery(index, expression).length === 0;
}

export function describeTanaQueryClause(
  index: TanaIndex,
  clause: TanaQueryPredicate,
): string {
  switch (clause.kind) {
    case 'field-equals':
      return `${getFieldDisplayName(index, clause.fieldId)} 等于 ${String(clause.value.value)}`;
    case 'field-greater-than':
      return `${getFieldDisplayName(index, clause.fieldId)} 大于 ${String(clause.value.value)}`;
    case 'field-less-than':
      return `${getFieldDisplayName(index, clause.fieldId)} 小于 ${String(clause.value.value)}`;
    case 'field-defined':
    case 'has-field':
      return `${getFieldDisplayName(index, clause.fieldId)} 已定义`;
    case 'field-exists':
      return `${getFieldDisplayName(index, clause.fieldId)} 已设置`;
    case 'has-supertag':
    case 'has-tag':
      return `包含 #${index.nodesById.get(clause.supertagId)?.text ?? clause.supertagId}`;
    case 'done-state':
      return clause.state === 'done' ? '已完成' : '待完成';
    case 'date-is':
      return `日期为 ${clause.date}`;
    case 'is-semantic':
      return clause.semantic === 'calendar-node'
        ? '是日历节点'
        : `是${clause.semantic === 'field' ? '字段' : '搜索'}`;
    case 'text-contains':
      return `文本包含“${clause.text}”`;
    case 'text-matches-regex':
      return `文本匹配 ${clause.pattern.startsWith('/') ? clause.pattern : `/${clause.pattern}/`}`;
    case 'child-of':
      return `是 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 的直接子节点`;
    case 'descendant-of':
      return `属于 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 的后代`;
    case 'grandchild-of':
      return `是 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 的孙节点`;
    case 'references':
      return `引用 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId}`;
    case 'referenced-by':
      return `被 ${index.nodesById.get(clause.nodeId)?.text ?? clause.nodeId} 引用`;
  }
}

/** Human-readable recursive summary of the same persisted AST used at runtime. */
export function describeTanaQueryExpression(
  index: TanaIndex,
  expression: TanaQueryExpression,
): string {
  switch (expression.type) {
    case 'predicate':
      return describeTanaQueryClause(index, expression.predicate);
    case 'not':
      return `非（${describeTanaQueryExpression(index, expression.child)}）`;
    case 'and':
    case 'or': {
      if (expression.children.length === 0) {
        return expression.type === 'and' ? '全部节点' : '无匹配节点';
      }
      const separator = expression.type === 'and' ? ' 且 ' : ' 或 ';
      return `（${expression.children
        .map((child) => describeTanaQueryExpression(index, child))
        .join(separator)}）`;
    }
  }
}

function fieldValuesEqual(
  predicate: FieldComparisonPredicate,
  node: TanaNode,
  index: TanaIndex,
) {
  return index.fieldNodesByParent.get(node.id)?.some(
    (field) => field.fieldId === predicate.fieldId && field.values.some(
      (actual) => actual.type === predicate.value.type && actual.value === predicate.value.value,
    ),
  ) ?? false;
}

function fieldValuesCompare(
  predicate: FieldComparisonPredicate,
  node: TanaNode,
  index: TanaIndex,
): boolean {
  if (predicate.value.type !== 'number' && predicate.value.type !== 'date') return false;
  return index.fieldNodesByParent.get(node.id)?.some((field) =>
    field.fieldId === predicate.fieldId && field.values.some((actual) => {
      if (actual.type !== predicate.value.type) return false;
      return predicate.kind === 'field-greater-than'
        ? actual.value > predicate.value.value
        : actual.value < predicate.value.value;
    }),
  ) ?? false;
}

function isDescendantOf(index: TanaIndex, nodeId: NodeId, ancestorId: NodeId): boolean {
  let parentId = index.parentNodeIds.get(nodeId);
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = index.parentNodeIds.get(parentId);
  }
  return false;
}

function isGrandchildOf(index: TanaIndex, nodeId: NodeId, grandparentId: NodeId): boolean {
  const parentId = index.parentNodeIds.get(nodeId);
  return !!parentId && index.parentNodeIds.get(parentId) === grandparentId;
}

/** A Daily page is a normal canonical Day Node, so its descendants share its date context. */
function isInTanaDay(index: TanaIndex, nodeId: NodeId, date: string): boolean {
  let currentId: NodeId | undefined = nodeId;
  const visited = new Set<NodeId>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (index.nodesById.get(currentId)?.time?.value === date) return true;
    currentId = index.parentNodeIds.get(currentId);
  }

  return false;
}

function hasDateFieldValue(index: TanaIndex, nodeId: NodeId, date: string): boolean {
  return (index.fieldNodesByParent.get(nodeId) ?? []).some((field) =>
    field.values.some((value) => value.type === 'date' && value.value === date),
  );
}

/** Direct mention/reference edges supply date context without chasing references. */
function hasReferencedDateContext(index: TanaIndex, nodeId: NodeId, date: string): boolean {
  return index.references.some((reference) => {
    if (reference.sourceNodeId !== nodeId) return false;
    const target = getTanaProjectionTarget(index, reference.targetNodeId);

    return !!target && (isInTanaDay(index, target.id, date) ||
      hasDateFieldValue(index, target.id, date));
  });
}

export function matchesTanaQueryPredicate(
  contextNode: TanaNode,
  index: TanaIndex,
  predicate: TanaQueryPredicate,
  contentNode: TanaNode = contextNode,
): boolean {
  switch (predicate.kind) {
    case 'field-equals':
      return fieldValuesEqual(predicate, contentNode, index);
    case 'field-greater-than':
    case 'field-less-than':
      return fieldValuesCompare(predicate, contentNode, index);
    case 'field-defined':
    case 'has-field':
      return isFieldDefined(index, contentNode.id, predicate.fieldId);
    case 'field-exists':
      return index.fieldNodesByParent.get(contentNode.id)?.some(
        (field) => field.fieldId === predicate.fieldId && field.hasStoredValue,
      ) ?? false;
    case 'has-supertag':
    case 'has-tag':
      return index.nodesBySupertag.get(predicate.supertagId)?.includes(contentNode.id) ?? false;
    case 'done-state':
      return contentNode.doneState === predicate.state;
    case 'date-is':
      return isInTanaDay(index, contextNode.id, predicate.date) ||
        hasReferencedDateContext(index, contextNode.id, predicate.date) ||
        isInTanaDay(index, contentNode.id, predicate.date) ||
        hasDateFieldValue(index, contentNode.id, predicate.date);
    case 'is-semantic':
      return predicate.semantic === 'calendar-node'
        ? contentNode.time !== undefined
        : contentNode.semanticTypes.includes(predicate.semantic);
    case 'text-contains':
      return contentNode.text.toLocaleLowerCase().includes(predicate.text.trim().toLocaleLowerCase());
    case 'text-matches-regex':
      return createTanaQueryRegExp(predicate.pattern).test(contentNode.text);
    case 'child-of':
      return index.parentNodeIds.get(contextNode.id) === predicate.nodeId;
    case 'descendant-of':
      return isDescendantOf(index, contextNode.id, predicate.nodeId);
    case 'grandchild-of':
      return isGrandchildOf(index, contextNode.id, predicate.nodeId);
    case 'references':
      return index.references.some(
        (reference) =>
          reference.sourceNodeId === contextNode.id &&
          reference.targetNodeId === predicate.nodeId,
      );
    case 'referenced-by':
      return index.references.some(
        (reference) =>
          reference.targetNodeId === contextNode.id &&
          reference.sourceNodeId === predicate.nodeId,
      );
  }
}

export function matchesTanaQueryExpression(
  contextNode: TanaNode,
  index: TanaIndex,
  expression: TanaQueryExpression,
  contentNode: TanaNode = contextNode,
): boolean {
  switch (expression.type) {
    case 'predicate':
      return matchesTanaQueryPredicate(contextNode, index, expression.predicate, contentNode);
    case 'not':
      return !matchesTanaQueryExpression(contextNode, index, expression.child, contentNode);
    case 'and':
      return expression.children.every((child) =>
        matchesTanaQueryExpression(contextNode, index, child, contentNode),
      );
    case 'or':
      return expression.children.some((child) =>
        matchesTanaQueryExpression(contextNode, index, child, contentNode),
      );
  }
}

/** Runs a Search AST from the derived index; malformed or broken queries fail closed. */
export function runTanaQuery(
  index: TanaIndex,
  expression: unknown,
  options: { excludeNodeId?: NodeId; limit?: number } = {},
): TanaNode[] {
  if (diagnoseTanaQuery(index, expression).length > 0) return [];
  const query = expression as TanaQueryExpression;
  const limit = Math.min(Math.max(options.limit ?? 2500, 0), 2500);
  if (limit === 0) return [];

  const seen = new Set<NodeId>();
  const results: TanaNode[] = [];
  for (const candidate of index.nodesById.values()) {
    const contentTarget = getTanaProjectionTarget(index, candidate.id);
    if (!contentTarget) continue;

    // The physical occurrence supplies hierarchy and direct Reference edges.
    // Its one canonical target supplies title, Field, Supertag and Done
    // content. The candidate itself is never replaced, so mixed predicates
    // retain both semantics before canonical result de-duplication.
    if (!matchesTanaQueryExpression(candidate, index, query, contentTarget)) continue;
    if (contentTarget.id === options.excludeNodeId || seen.has(contentTarget.id)) continue;
    seen.add(contentTarget.id);
    results.push(contentTarget);
    if (results.length >= limit) break;
  }
  return results;
}
