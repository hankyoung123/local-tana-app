import type {
  FieldDefinition,
  FieldType,
  FieldValidationIssue,
  FieldValue,
  NodeId,
} from './types';
import { isTanaDay } from './time';

/** URL fields intentionally accept only explicit http(s) URLs. */
export function isTanaUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A deliberately small address check; delivery verification is not local-document semantics. */
export function isTanaEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isTanaStringFieldValueValid(type: FieldType, value: string): boolean {
  if (type === 'url') return isTanaUrl(value);
  if (type === 'email') return isTanaEmail(value);

  return true;
}

export function isTanaNumberInRange(definition: FieldDefinition, value: number): boolean {
  return (
    definition.type === 'number' &&
    Number.isFinite(value) &&
    (definition.min === undefined || value >= definition.min) &&
    (definition.max === undefined || value <= definition.max)
  );
}

/**
 * Pure derived validation for a decoded Value. Callers retain the Value Node
 * regardless of these issues; `candidateIds` is document-derived at the call
 * site and never a persisted cache.
 */
export function getFieldValueValidationIssues(
  definition: FieldDefinition,
  value: FieldValue,
  candidateIds?: ReadonlySet<NodeId>
): readonly FieldValidationIssue[] {
  if (definition.type !== value.type) return ['incompatible-type'];

  if (definition.type === 'date' && value.type === 'date') {
    return isTanaDay(value.value) ? [] : ['invalid-date'];
  }

  if (definition.type === 'email' && value.type === 'email') {
    return isTanaEmail(value.value) ? [] : ['invalid-email'];
  }

  if (definition.type === 'url' && value.type === 'url') {
    return isTanaUrl(value.value) ? [] : ['invalid-url'];
  }

  if (definition.type === 'number' && value.type === 'number') {
    return isTanaNumberInRange(definition, value.value) ? [] : ['invalid-number'];
  }

  if (
    (definition.type === 'options' && value.type === 'options') ||
    (definition.type === 'from-supertag' && value.type === 'from-supertag')
  ) {
    return candidateIds?.has(value.value) ? [] : ['invalid-option'];
  }

  return [];
}
