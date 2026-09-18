import type { DateOperand, FieldValue, TanaQueryExpression, TanaQueryPredicate } from './types';
import { isTanaDateValue } from './time';

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

function isDateOperand(value: unknown): value is DateOperand {
  if (!record(value)) return false;
  if (value.kind === 'literal') {
    return keys(value, ['kind', 'value']) && typeof value.value === 'string' && isTanaDateValue(value.value);
  }
  return value.kind === 'calendar-context' &&
    (keys(value, ['kind', 'ancestor']) || keys(value, ['kind', 'ancestor', 'offset'])) &&
    (value.ancestor === 'parent' || value.ancestor === 'grandparent') &&
    (value.offset === undefined ||
      (typeof value.offset === 'number' && Number.isInteger(value.offset) && Math.abs(value.offset) <= 36_600));
}

function isFieldValue(value: unknown): value is FieldValue {
  if (!record(value) || !keys(value, ['type', 'value'])) return false;
  switch (value.type) {
    case 'checkbox': return typeof value.value === 'boolean';
    case 'number': return typeof value.value === 'number' && Number.isFinite(value.value);
    case 'options':
    case 'from-supertag': return id(value.value);
    case 'plain':
    case 'email':
    case 'url': return typeof value.value === 'string';
    case 'date': return isTanaDateValue(value.value);
    default: return false;
  }
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
      return keys(value, ['kind', 'date']) && typeof value.date === 'string' && isTanaDateValue(value.date);
    case 'date-overlaps':
      return keys(value, ['kind', 'fieldId', 'value']) && id(value.fieldId) && isDateOperand(value.value);
    case 'on-day-node':
      return keys(value, ['kind']);
    case 'is-semantic':
      return keys(value, ['kind', 'semantic']) &&
        (value.semantic === 'calendar-node' || value.semantic === 'field' || value.semantic === 'search');
    case 'text-matches-regex':
      if (!keys(value, ['kind', 'pattern']) || typeof value.pattern !== 'string' || value.pattern.length === 0 || value.pattern.length > 256) return false;
      try { createTanaQueryRegExp(value.pattern); return true; } catch { return false; }
    case 'field-equals':
    case 'field-greater-than':
    case 'field-less-than': {
      return keys(value, ['kind', 'fieldId', 'value']) && id(value.fieldId) &&
        (isFieldValue(value.value) || isDateOperand(value.value));
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
  const migrated = migrateLegacyTanaQuery(value);
  if (!migrated) throw new Error('Invalid Tana Query AST');
  return migrated;
}


/** Persisted Search definitions reserve an AND root for stable editor mutations. */
export function isTanaSearchQueryAst(value: unknown): value is Extract<TanaQueryExpression, { type: 'and' }> {
  return isTanaQueryAst(value) && value.type === 'and';
}

/**
 * The previous public `date-overlaps` had no field identity and accidentally
 * scanned unrelated date sources.  Read it once as an exact Date Object
 * predicate; all writers and the strict AST validator emit only the new,
 * field-scoped overlap operator.
 */
function isLegacyDateOverlapsPredicate(value: unknown): value is { date: string; kind: 'date-overlaps' } {
  return record(value) && keys(value, ['kind', 'date']) && value.kind === 'date-overlaps' &&
    typeof value.date === 'string' && isTanaDateValue(value.date);
}

function migrateExpression(value: unknown, ancestors: Set<object>, depth: number, count: { value: number }): TanaQueryExpression | undefined {
  if (!record(value) || depth > 128 || ++count.value > 10_000 || ancestors.has(value)) return;
  ancestors.add(value);
  try {
    if (value.type === 'predicate' && keys(value, ['type', 'predicate'])) {
      if (isTanaQueryPredicateAst(value.predicate)) {
        return { predicate: value.predicate, type: 'predicate' };
      }
      if (isLegacyDateOverlapsPredicate(value.predicate)) {
        return { predicate: { date: value.predicate.date, kind: 'date-is' }, type: 'predicate' };
      }
      return;
    }
    if (value.type === 'not' && keys(value, ['type', 'child'])) {
      const child = migrateExpression(value.child, ancestors, depth + 1, count);
      return child ? { child, type: 'not' } : undefined;
    }
    if ((value.type === 'and' || value.type === 'or') && keys(value, ['type', 'children']) && Array.isArray(value.children)) {
      const children: TanaQueryExpression[] = [];
      for (const child of value.children) {
        const migrated = migrateExpression(child, ancestors, depth + 1, count);
        if (!migrated) return;
        children.push(migrated);
      }
      return { children, type: value.type };
    }
    return;
  } finally {
    ancestors.delete(value);
  }
}

/** Explicit reader compatibility for persisted F07 pre-freeze overlap ASTs. */
export function migrateLegacyTanaQuery(value: unknown): TanaQueryExpression | undefined {
  return migrateExpression(value, new Set<object>(), 0, { value: 0 });
}

/** Persistence may read the one legacy predicate, while new writes stay strict. */
export function isTanaSearchQueryAstOrLegacy(value: unknown): boolean {
  const migrated = migrateLegacyTanaQuery(value);
  return !!migrated && migrated.type === 'and';
}
