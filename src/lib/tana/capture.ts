import type { NodeId } from "./types";

export const TANA_CAPTURE_MAX_LENGTH = 20_000;

export type TanaCapturePayload = {
  text: string;
};

export type TanaCaptureAck = {
  ok: boolean;
  nodeId?: NodeId;
  error?: string;
};

export function parseTanaCapturePayload(
  value: unknown,
): TanaCapturePayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const text = (value as { text?: unknown }).text;
  if (typeof text !== "string" || text.length > TANA_CAPTURE_MAX_LENGTH) return;
  return { text };
}
