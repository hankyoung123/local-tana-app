import {
  createTanaQueryRegExp,
  isTanaQueryPredicateAst,
  migrateLegacyTanaQuery,
} from './query-ast';
import type {
  FieldDefinition,
  FieldId,
  FieldValue,
  DateOperand,
  NodeId,
  TanaIndex,
  TanaNode,
  TanaQueryExpression,
  TanaQueryPredicate,
} from './types';
import { getTanaSystemFieldDefinition, getTanaSystemFieldLabel, getTanaSystemFieldValue, isFieldDefined, isFieldValueCompatible } from './fields';
import { getTanaProjectionTarget, isTanaNodeActive } from './index';
import { compareTanaDateValues, isTanaTime, offsetCalendarValue, tanaDateValuesOverlap } from './time';
import { TANA_DATE_OBJECT_KEY } from './constants';

type FieldComparisonPredicate = {
  fieldId: FieldId;
  kind: 'field-equals' | 'field-greater-than' | 'field-less-than';
  value: FieldValue | DateOperand;
};

function isDateOperand(value: FieldValue | DateOperand): value is DateOperand {
  return 'kind' in value && (value.kind === 'literal' || value.kind === 'calendar-context');
}

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
    : getTanaSystemFieldDefinition(fieldId);
}

export function getFieldDisplayName(index: TanaIndex, fieldId: FieldId): string {
  return index.nodesById.get(fieldId)?.text || getTanaSystemFieldLabel(fieldId) || fieldId;
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
  const systemField = getTanaSystemFieldDefinition(fieldId);
  if (systemField) return systemField;
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
      if (isDateOperand(predicate.value)) {
        if (field.type !== 'date') return { code: 'incompatible-field-value', predicate };
      } else if (!isFieldValueCompatible(field, predicate.value) ||
        ((predicate.kind === 'field-greater-than' || predicate.kind === 'field-less-than') &&
          predicate.value.type !== 'number' && predicate.value.type !== 'date')) {
        return { code: 'incompatible-field-value', predicate };
      }
      if (!isDateOperand(predicate.value) && (predicate.value.type === 'options' || predicate.value.type === 'from-supertag')) {
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
      return undefined;
    case 'date-overlaps': {
      const field = activeFieldDefinition(index, predicate.fieldId);
      return !field ? { code: 'missing-field', predicate } : field.type === 'date' ? undefined : { code: 'incompatible-field-value', predicate };
    }
    case 'on-day-node':
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
  const migrated = migrateLegacyTanaQuery(expression);
  if (!migrated) return [{ code: 'invalid-ast' }];

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
  visit(migrated);
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

function describeDateOperand(value: FieldValue | DateOperand): string {
  if (!isDateOperand(value)) return String(value.value);
  if (value.kind === 'literal') return value.value;
  const label = value.ancestor === 'parent' ? '父节点' : '祖父节点';
  return `${label}日期${value.offset ? `${value.offset > 0 ? '+' : ''}${value.offset}` : ''}`;
}

export function describeTanaQueryClause(
  index: TanaIndex,
  clause: TanaQueryPredicate,
): string {
  switch (clause.kind) {
    case 'field-equals':
      return `${getFieldDisplayName(index, clause.fieldId)} 等于 ${describeDateOperand(clause.value)}`;
    case 'field-greater-than':
      return `${getFieldDisplayName(index, clause.fieldId)} 大于 ${describeDateOperand(clause.value)}`;
    case 'field-less-than':
      return `${getFieldDisplayName(index, clause.fieldId)} 小于 ${describeDateOperand(clause.value)}`;
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
    case 'date-overlaps':
      return `${getFieldDisplayName(index, clause.fieldId)} 与 ${describeDateOperand(clause.value)} 重叠`;
    case 'on-day-node':
      return '位于任意日期节点下';
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
  contextNodeId: NodeId,
) {
  const value = predicate.value;
  if (isDateOperand(value)) {
    const expected = resolveDateOperand(index, contextNodeId, value);
    if (!expected) return false;
    return getDateFieldValues(index, node.id, predicate.fieldId).some((value) => value === expected);
  }
  const systemValue = getTanaSystemFieldValue(index, node.id, predicate.fieldId);
  if (systemValue) return systemValue.type === value.type && systemValue.value === value.value;
  return index.fieldNodesByParent.get(node.id)?.some(
    (field) => field.fieldId === predicate.fieldId && field.values.some(
      (actual) => actual.type === value.type && actual.value === value.value,
    ),
  ) ?? false;
}

function fieldValuesCompare(
  predicate: FieldComparisonPredicate,
  node: TanaNode,
  index: TanaIndex,
  contextNodeId: NodeId,
): boolean {
  const value = predicate.value;
  if (isDateOperand(value)) {
    const expected = resolveDateOperand(index, contextNodeId, value);
    if (!expected) return false;
    return getDateFieldValues(index, node.id, predicate.fieldId).some((actual) => {
      const compared = compareTanaDateValues(actual, expected);
      return compared !== undefined && (predicate.kind === 'field-greater-than' ? compared > 0 : compared < 0);
    });
  }
  if (value.type !== 'number' && value.type !== 'date') return false;
  const systemValue = getTanaSystemFieldValue(index, node.id, predicate.fieldId);
  if (systemValue && systemValue.type === value.type) {
    if (systemValue.type === 'date') {
      const compared = compareTanaDateValues(systemValue.value, value.value as string);
      return compared === undefined ? false : predicate.kind === 'field-greater-than' ? compared > 0 : compared < 0;
    }
    return false;
  }
  return index.fieldNodesByParent.get(node.id)?.some((field) =>
    field.fieldId === predicate.fieldId && field.values.some((actual) => {
      if (actual.type !== value.type) return false;
      if (actual.type === 'date') {
        const compared = compareTanaDateValues(actual.value, value.value as string);
        return compared === undefined ? false : predicate.kind === 'field-greater-than' ? compared > 0 : compared < 0;
      }
      if (value.type !== 'number' || actual.type !== 'number') return false;
      return predicate.kind === 'field-greater-than' ? actual.value > value.value : actual.value < value.value;
    }),
  ) ?? false;
}

function getDateFieldValues(index: TanaIndex, nodeId: NodeId, fieldId: FieldId): string[] {
  const systemValue = getTanaSystemFieldValue(index, nodeId, fieldId);
  const values = systemValue?.type === 'date' ? [systemValue.value] : [];
  for (const field of index.fieldNodesByParent.get(nodeId) ?? []) {
    if (field.fieldId === fieldId) {
      values.push(...field.values.filter((value) => value.type === 'date').map((value) => value.value));
    }
  }
  return values;
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

function hasDateObjectValue(index: TanaIndex, nodeId: NodeId, date: string): boolean {
  const node = index.nodesById.get(nodeId);
  if (!node) return false;
  const visit = (element: { type?: unknown; children?: readonly unknown[]; tanaDateValue?: unknown }): boolean => {
    if (element.type === TANA_DATE_OBJECT_KEY && element.tanaDateValue === date) return true;
    return Array.isArray(element.children) && element.children.some((child) => !!child && typeof child === 'object' && visit(child as { type?: unknown; children?: readonly unknown[]; tanaDateValue?: unknown }));
  };
  return visit(node.node as { type?: unknown; children?: readonly unknown[]; tanaDateValue?: unknown });
}

/** Only a direct parent Day establishes the `ON DAY NODE` occurrence context. */
function hasDirectDayParent(index: TanaIndex, nodeId: NodeId): boolean {
  const parentId = index.parentNodeIds.get(nodeId);
  return index.nodesById.get(parentId ?? '')?.time?.unit === 'day';
}

function getCalendarContextTime(
  index: TanaIndex,
  nodeId: NodeId,
  ancestor: 'parent' | 'grandparent',
  offset = 0,
) {
  const parentId = index.parentNodeIds.get(nodeId);
  const contextId = ancestor === 'parent'
    ? parentId
    : parentId ? index.parentNodeIds.get(parentId) : undefined;
  const time = contextId ? index.nodesById.get(contextId)?.time : undefined;
  if (!time || !isTanaTime(time)) return;
  return offsetCalendarValue(time, offset);
}

function resolveDateOperand(index: TanaIndex, nodeId: NodeId, operand: DateOperand): string | undefined {
  if (operand.kind === 'literal') return operand.value;
  const time = getCalendarContextTime(index, nodeId, operand.ancestor, operand.offset ?? 0);
  return time?.value;
}

function hasFieldValue(index: TanaIndex, nodeId: NodeId, fieldId: FieldId): boolean {
  const systemValue = getTanaSystemFieldValue(index, nodeId, fieldId);
  if (systemValue) return true;
  return index.fieldNodesByParent.get(nodeId)?.some((field) => field.fieldId === fieldId && field.hasStoredValue) ?? false;
}

export function matchesTanaQueryPredicate(
  contextNode: TanaNode,
  index: TanaIndex,
  predicate: TanaQueryPredicate,
  contentNode: TanaNode = contextNode,
): boolean {
  switch (predicate.kind) {
    case 'field-equals':
      return fieldValuesEqual(predicate, contentNode, index, contextNode.id);
    case 'field-greater-than':
    case 'field-less-than':
      return fieldValuesCompare(predicate, contentNode, index, contextNode.id);
    case 'field-defined':
    case 'has-field':
      return getTanaSystemFieldValue(index, contentNode.id, predicate.fieldId) !== undefined || isFieldDefined(index, contentNode.id, predicate.fieldId);
    case 'field-exists':
      return hasFieldValue(index, contentNode.id, predicate.fieldId);
    case 'has-supertag':
    case 'has-tag':
      return index.nodesBySupertag.get(predicate.supertagId)?.includes(contentNode.id) ?? false;
    case 'done-state':
      return contentNode.doneState === predicate.state;
    case 'date-is':
      return hasDateObjectValue(index, contentNode.id, predicate.date);
    case 'date-overlaps': {
      const field = activeFieldDefinition(index, predicate.fieldId);
      if (!field || field.type !== 'date') return false;
      const expected = resolveDateOperand(index, contextNode.id, predicate.value);
      return expected !== undefined && getDateFieldValues(index, contentNode.id, predicate.fieldId)
        .some((actual) => tanaDateValuesOverlap(actual, expected));
    }
    case 'on-day-node':
      return hasDirectDayParent(index, contextNode.id);
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
  const query = migrateLegacyTanaQuery(expression);
  if (!query || diagnoseTanaQuery(index, query).length > 0) return [];
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
