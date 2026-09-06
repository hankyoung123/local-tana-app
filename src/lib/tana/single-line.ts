/** Canonical Tana Nodes are single-line blocks at every editing boundary. */
export const TANA_SOFT_LINE_BREAK = /[\r\n\u2028\u2029]/;

export function containsTanaSoftLineBreak(value: string): boolean {
  return TANA_SOFT_LINE_BREAK.test(value);
}

export function splitTanaNodeLines(value: string): string[] {
  return value.split(/\r\n|[\r\n\u2028\u2029]/);
}
