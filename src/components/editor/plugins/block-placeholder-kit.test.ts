import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { isTanaContentPlaceholderNode } from './block-placeholder-kit';

test('only exposes the content placeholder for ordinary content Nodes', () => {
  const document: Value = [
    { children: [{ text: '' }], id: 'content', type: KEYS.p },
    {
      children: [{ text: '' }],
      id: 'definition',
      tanaFieldDefinition: { type: 'plain' },
      type: KEYS.p
    },
    {
      children: [{ text: '' }],
      id: 'field',
      indent: 1,
      tanaFieldId: 'definition',
      type: KEYS.p
    },
    {
      children: [{ text: '' }],
      id: 'value',
      indent: 2,
      tanaFieldValueType: 'plain',
      type: KEYS.p
    }
  ];

  assert.equal(isTanaContentPlaceholderNode(document[0], [0], document), true);
  assert.equal(isTanaContentPlaceholderNode(document[1], [1], document), false);
  assert.equal(isTanaContentPlaceholderNode(document[2], [2], document), false);
  assert.equal(isTanaContentPlaceholderNode(document[3], [3], document), false);
});
