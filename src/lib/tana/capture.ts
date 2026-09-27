import { KEYS, type Descendant, type TElement, type TText, type Value } from "platejs";

import { TANA_DATE_OBJECT_KEY, TANA_SUPERTAG_KEY } from "./constants";
import { isTanaDateValue } from "./time";
import type { FieldValue, NodeId, TanaCaptureDraft, TanaCaptureField, TanaIndex } from "./types";

export const TANA_CAPTURE_MAX_LENGTH = 20_000;
export const TANA_CAPTURE_MAX_SERIALIZED_LENGTH = 80_000;

export type TanaCapturePayload = TanaCaptureDraft & { requestId: string };

export type TanaCaptureAck = {
  ok: boolean;
  requestId?: string;
  nodeId?: NodeId;
  error?: string;
};

function isPrimitiveMark(value: unknown): value is boolean | number | string {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function sanitizeText(value: unknown): TText | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  if (typeof source.text !== "string") return;
  const text: Record<string, unknown> = { text: source.text };
  for (const [key, mark] of Object.entries(source)) {
    if (key === "text" || key.startsWith("tana") || key === "id" || key === "key") continue;
    if (!isPrimitiveMark(mark)) return;
    text[key] = mark;
  }
  return text as TText;
}

function sanitizeInline(value: unknown, index?: TanaIndex): Descendant | undefined {
  const text = sanitizeText(value);
  if (text) return text;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  if (typeof source.type !== "string" || !Array.isArray(source.children) || source.children.length === 0) return;
  const children = source.children.map((child) => sanitizeInline(child, index));
  if (children.some((child): child is undefined => !child)) return;
  const safeChildren = children as Descendant[];

  if (source.type === KEYS.mention) {
    if (typeof source.key !== "string" || (index && !index.nodesById.has(source.key))) return;
    return { children: safeChildren, key: source.key, type: KEYS.mention } as TElement;
  }
  if (source.type === TANA_SUPERTAG_KEY) {
    if (typeof source.key !== "string") return;
    const target = index?.nodesById.get(source.key);
    if (index && (!target || !target.semanticTypes.includes("supertag-definition"))) return;
    return { children: safeChildren, key: source.key, type: TANA_SUPERTAG_KEY } as TElement;
  }
  if (source.type === TANA_DATE_OBJECT_KEY) {
    if (typeof source.tanaDateValue !== "string" || !isTanaDateValue(source.tanaDateValue)) return;
    return { children: safeChildren, tanaDateValue: source.tanaDateValue, type: TANA_DATE_OBJECT_KEY } as TElement;
  }
  if (source.type === KEYS.link || source.type === "a") {
    const url = source.url ?? source.href;
    if (typeof url !== "string" || url.length === 0 || url.length > 4096) return;
    return { children: safeChildren, type: source.type, url } as TElement;
  }
  return;
}

function sanitizeContent(value: unknown, index?: TanaIndex): readonly Descendant[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return;
  const content = value.map((child) => sanitizeInline(child, index));
  if (content.some((child): child is undefined => !child)) return;
  const safeContent = content as Descendant[];
  if (JSON.stringify(safeContent).length > TANA_CAPTURE_MAX_SERIALIZED_LENGTH) return;
  return safeContent;
}

function isFieldValue(value: unknown): value is FieldValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string" || !("value" in candidate)) return false;
  switch (candidate.type) {
    case "checkbox": return typeof candidate.value === "boolean";
    case "number": return typeof candidate.value === "number" && Number.isFinite(candidate.value);
    case "date": return typeof candidate.value === "string" && isTanaDateValue(candidate.value);
    case "email":
    case "plain":
    case "url": return typeof candidate.value === "string" && candidate.value.length <= TANA_CAPTURE_MAX_LENGTH;
    case "from-supertag":
    case "options": return typeof candidate.value === "string" && candidate.value.length > 0;
    default: return false;
  }
}

function sanitizeDraft(value: unknown, index?: TanaIndex): TanaCaptureDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  const content = sanitizeContent(source.content, index);
  if (!content) return;
  const supertagIds = source.supertagIds === undefined
    ? undefined
    : Array.isArray(source.supertagIds) && source.supertagIds.every((id) => {
        if (typeof id !== "string") return false;
        const node = index?.nodesById.get(id);
        return !index || !!node && node.semanticTypes.includes("supertag-definition");
      })
      ? [...new Set(source.supertagIds as string[])]
      : undefined;
  if (source.supertagIds !== undefined && !supertagIds) return;
  const fields = source.fields === undefined
    ? undefined
    : Array.isArray(source.fields) && source.fields.every((field) => {
        if (!field || typeof field !== "object" || Array.isArray(field)) return false;
        const candidate = field as Record<string, unknown>;
        if (typeof candidate.fieldId !== "string") return false;
        if (index && !index.nodesById.get(candidate.fieldId)?.fieldDefinition) return false;
        return candidate.value === undefined || isFieldValue(candidate.value);
      })
      ? (source.fields as TanaCaptureField[]).map((field) => ({
          fieldId: field.fieldId,
          ...(field.value ? { value: field.value } : {}),
        }))
      : undefined;
  if (source.fields !== undefined && !fields) return;
  return { content, ...(supertagIds ? { supertagIds } : {}), ...(fields ? { fields } : {}) };
}

/** Converts legacy string drafts into the rich draft envelope. */
export function normalizeTanaCaptureDraft(value: unknown): TanaCaptureDraft {
  if (typeof value === "string") return { content: [{ text: value }] };
  return sanitizeDraft(value) ?? { content: [{ text: "" }] };
}

export function isTanaCaptureDraft(value: unknown): value is TanaCaptureDraft {
  return !!sanitizeDraft(value);
}

export function parseTanaCapturePayload(value: unknown, index?: TanaIndex): TanaCapturePayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  if (typeof source.requestId !== "string" || source.requestId.length === 0 || source.requestId.length > 128) return;
  const draft = sanitizeDraft(source, index);
  if (!draft) return;
  return { requestId: source.requestId, ...draft };
}

/** Backwards-compatible parser for old text-only capture callers. */
export function parseLegacyTanaCapturePayload(value: unknown): TanaCapturePayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  if (typeof source.text !== "string" || source.text.length > TANA_CAPTURE_MAX_LENGTH) return;
  const requestId = typeof source.requestId === "string" && source.requestId.length > 0 ? source.requestId : "legacy";
  return { requestId, content: [{ text: source.text }] };
}

export function captureDraftHasText(draft: TanaCaptureDraft): boolean {
  return draft.content.some((node) => "text" in node && typeof node.text === "string" && node.text.length > 0);
}

export type TanaCaptureDocument = Value;
