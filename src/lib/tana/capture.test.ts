import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseLegacyTanaCapturePayload, parseTanaCapturePayload, TANA_CAPTURE_MAX_LENGTH } from './capture';

describe('capture payload boundary', () => {
  test('accepts rich content and rejects malformed or oversized payloads', () => {
    assert.deepEqual(parseTanaCapturePayload({ requestId: 'r1', content: [{ text: 'hello', bold: true }] }), {
      requestId: 'r1', content: [{ text: 'hello', bold: true }],
    });
    assert.deepEqual(parseLegacyTanaCapturePayload({ text: 'hello' }), {
      requestId: 'legacy', content: [{ text: 'hello' }],
    });
    assert.equal(parseLegacyTanaCapturePayload({ text: 'x'.repeat(TANA_CAPTURE_MAX_LENGTH + 1) }), undefined);
    assert.equal(parseTanaCapturePayload({ requestId: 'r1', content: [{ text: 1 }] }), undefined);
    assert.equal(parseTanaCapturePayload(null), undefined);
  });
});
