import type { TanaQueryExpression, TanaQueryPredicate } from './types';
import { isTanaDay } from './time';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && !/[\s\x00-\x1f\x7f]/u.test(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));

type RegexGroup = {
  hasAlternation: boolean;
  hasQuantifier: boolean;
  justOpened: boolean;
};

function quantifierEnd(source: string, offset: number): number | undefined {
  const end = source.indexOf('}', offset + 1);
  if (end < 0) return;
  return /^\{\d+(?:,\d*)?\}$/u.test(source.slice(offset, end + 1)) ? end : undefined;
}

/**
 * JavaScript RegExp has no timeout. Reject the small family of expressions
 * whose nested repetition or ambiguous repeated alternation can blow up on
 * ordinary title text before the runtime ever constructs a RegExp.
 */
function isSafeTanaQueryRegExp(source: string): boolean {
  if (/\\[1-9]/u.test(source)) return false;

  const groups: RegexGroup[] = [{ hasAlternation: false, hasQuantifier: false, justOpened: false }];
  let lastClosed: RegexGroup | undefined;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (character === '\\') {
      index += 1;
      lastClosed = undefined;
      continue;
    }

    if (character === '[') {
      index += 1;
      while (index < source.length && source[index] !== ']') {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      lastClosed = undefined;
      continue;
    }

    if (character === '(') {
      groups.push({ hasAlternation: false, hasQuantifier: false, justOpened: true });
      lastClosed = undefined;
      continue;
    }

    if (character === ')') {
      if (groups.length === 1) return false;
      const closed = groups.pop()!;
      const parent = groups.at(-1)!;
      if (closed.hasQuantifier) parent.hasQuantifier = true;
      if (closed.hasAlternation) parent.hasAlternation = true;
      lastClosed = closed;
      continue;
    }

    const current = groups.at(-1)!;
    if (character === '?' && current.justOpened) {
      current.justOpened = false;
      lastClosed = undefined;
      continue;
    }
    current.justOpened = false;

    if (character === '|') {
      current.hasAlternation = true;
      lastClosed = undefined;
      continue;
    }

    const braceEnd = character === '{' ? quantifierEnd(source, index) : undefined;
    if (character === '*' || character === '+' || character === '?' || braceEnd !== undefined) {
      if (lastClosed && (lastClosed.hasQuantifier || lastClosed.hasAlternation)) return false;
      current.hasQuantifier = true;
      lastClosed = undefined;
      if (braceEnd !== undefined) index = braceEnd;
      continue;
    }

    lastClosed = undefined;
  }

  return groups.length === 1;
}

/** Accept the UI's familiar `/pattern/` form while retaining plain regex input. */
export function createTanaQueryRegExp(pattern: string): RegExp {
  const slashDelimited = /^\/([\s\S]*)\/$/u.exec(pattern);
  const source = slashDelimited ? slashDelimited[1]! : pattern;

  if (source.length === 0) throw new Error('Empty regular expression');
  if (!isSafeTanaQueryRegExp(source)) throw new Error('Unsafe regular expression');

  return new RegExp(source, 'iu');
}

export function isTanaQueryPredicateAst(value: unknown): value is TanaQueryPredicate {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'text-contains':
      return keys(value, ['kind', 'text']) && typeof value.text === 'string' && value.text.trim().length > 0;
    case 'has-supertag':
    case 'has-tag':
      return keys(value, ['kind', 'supertagId']) && id(value.supertagId);
    case 'field-defined':
    case 'field-exists':
    case 'has-field':
      return keys(value, ['kind', 'fieldId']) && id(value.fieldId);
    case 'done-state':
      return keys(value, ['kind', 'state']) && (value.state === 'todo' || value.state === 'done');
    case 'date-is':
      return keys(value, ['kind', 'date']) && typeof value.date === 'string' && isTanaDay(value.date);
    case 'is-semantic':
      return keys(value, ['kind', 'semantic']) &&
        (value.semantic === 'calendar-node' || value.semantic === 'field' || value.semantic === 'search');
    case 'text-matches-regex':
      if (!keys(value, ['kind', 'pattern']) || typeof value.pattern !== 'string' || value.pattern.length === 0 || value.pattern.length > 256) return false;
      try { createTanaQueryRegExp(value.pattern); return true; } catch { return false; }
    case 'field-equals':
    case 'field-greater-than':
    case 'field-less-than': {
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
    case 'grandchild-of':
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


/** Persisted Search definitions reserve an AND root for stable editor mutations. */
export function isTanaSearchQueryAst(value: unknown): value is Extract<TanaQueryExpression, { type: 'and' }> {
  return isTanaQueryAst(value) && value.type === 'and';
}
