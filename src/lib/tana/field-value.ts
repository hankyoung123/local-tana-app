import type { FieldDefinition, FieldType } from './types';

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
