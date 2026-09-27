import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseTanaCapturePayload, TANA_CAPTURE_MAX_LENGTH } from './capture';

describe('capture payload boundary', () => {
  test('accepts text and rejects malformed or oversized payloads', () => {
    assert.deepEqual(parseTanaCapturePayload({ text: 'hello' }), { text: 'hello' });
    assert.equal(parseTanaCapturePayload({ text: 'x'.repeat(TANA_CAPTURE_MAX_LENGTH + 1) }), undefined);
    assert.equal(parseTanaCapturePayload({ text: 1 }), undefined);
    assert.equal(parseTanaCapturePayload(null), undefined);
  });
});
