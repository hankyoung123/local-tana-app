import type { TanaQueryExpression, TanaQueryPredicate } from './types';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !/[\s\x00-\x1f\x7f]/u.test(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));

export function isTanaQueryPredicateAst(value: unknown): value is TanaQueryPredicate {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'text-contains':
      return keys(value, ['kind', 'text']) && typeof value.text === 'string' && value.text.trim().length > 0;
    case 'has-supertag':
      return keys(value, ['kind', 'supertagId']) && id(value.supertagId);
    case 'field-defined':
    case 'field-exists':
      return keys(value, ['kind', 'fieldId']) && id(value.fieldId);
    case 'field-equals': {
      if (!keys(value, ['kind', 'fieldId', 'value']) || !id(value.fieldId) || !record(value.value) || !keys(value.value, ['type', 'value'])) return false;
      const field = value.value;
      switch (field.type) {
        case 'checkbox': return typeof field.value === 'boolean';
        case 'number': return typeof field.value === 'number' && Number.isFinite(field.value);
        case 'options':
        case 'from-supertag': return id(field.value);
        case 'plain':
        case 'date':
        case 'email':
        case 'url': return typeof field.value === 'string';
        default: return false;
      }
    }
    case 'child-of':
    case 'descendant-of':
    case 'references':
    case 'referenced-by':
      return keys(value, ['kind', 'nodeId']) && id(value.nodeId);
    default: return false;
  }
}

/** One runtime grammar for persistence, integrity and execution. Bounded and cycle-safe. */
export function isTanaQueryAst(value: unknown): value is TanaQueryExpression {
  const ancestors = new Set<object>();
  let count = 0;
  function visit(expression: unknown, depth: number): boolean {
    if (!record(expression) || depth > 128 || ++count > 10000 || ancestors.has(expression)) return false;
    ancestors.add(expression);
    let valid = false;
    switch (expression.type) {
      case 'predicate': valid = keys(expression, ['type', 'predicate']) && isTanaQueryPredicateAst(expression.predicate); break;
      case 'not': valid = keys(expression, ['type', 'child']) && visit(expression.child, depth + 1); break;
      case 'and':
      case 'or': valid = keys(expression, ['type', 'children']) && Array.isArray(expression.children) && expression.children.every((child) => visit(child, depth + 1)); break;
    }
    ancestors.delete(expression);
    return valid;
  }
  return visit(value, 0);
}

export function parseTanaQuery(value: unknown): TanaQueryExpression {
  if (!isTanaQueryAst(value)) throw new Error('Invalid Tana Query AST');
  return value;
}
