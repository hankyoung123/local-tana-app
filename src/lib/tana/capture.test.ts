import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Value } from 'platejs';

import { extractTanaCaptureDraft, parseLegacyTanaCapturePayload, parseTanaCapturePayload, TANA_CAPTURE_MAX_LENGTH } from './capture';
import { initialDocument } from './initial-document';

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

  test('extracts host metadata and Field-as-Node values from a transient Plate value', () => {
    const value = [
      {
        children: [{ text: 'draft' }],
        id: 'capture-root',
        indent: 0,
        tanaSupertagIds: ['supertag-project'],
        type: 'p',
      },
      {
        children: [{ text: 'Field' }],
        id: 'capture-field',
        indent: 1,
        tanaFieldId: 'field-summary',
        type: 'p',
      },
      {
        children: [{ text: 'value' }],
        id: 'capture-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: 'p',
      },
      ...structuredClone(initialDocument),
    ] as Value;
    assert.deepEqual(extractTanaCaptureDraft(value, 'capture-root'), {
      content: [{ text: 'draft' }],
      supertagIds: ['supertag-project'],
      fields: [{ fieldId: 'field-summary', value: { type: 'plain', value: 'value' } }],
    });
  });
});
