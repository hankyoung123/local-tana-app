import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isPlateDocument } from './persistence';

describe('isPlateDocument', () => {
  test('accepts a serializable Plate value', () => {
    assert.equal(
      isPlateDocument([
        {
          children: [
            { text: 'A' },
            {
              children: [{ text: '' }],
              type: 'mention',
              value: 'B',
            },
          ],
          id: 'node-a',
          type: 'p',
        },
      ]),
      true
    );
  });

  test('rejects malformed and empty documents', () => {
    assert.equal(isPlateDocument([]), false);
    assert.equal(isPlateDocument([{ children: 'nope', type: 'p' }]), false);
  });
});
