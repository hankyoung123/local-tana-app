import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TElement, Value } from 'platejs';

import { isTanaSearchHost } from './search-host';

const document: Value = [
  { children: [{ text: 'Ordinary' }], id: 'ordinary', type: 'p' },
  { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'outline' }, type: 'p' },
  { children: [{ text: 'Target' }], id: 'target', type: 'p' },
  { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: 'p' },
  { children: [{ text: 'Field definition' }], id: 'field-definition', tanaFieldDefinition: { type: 'options' }, type: 'p' },
  { children: [{ text: 'Option' }], id: 'option', indent: 1, type: 'p' },
  { children: [{ text: 'Host' }], id: 'host', type: 'p' },
  { children: [{ text: '' }], id: 'field', indent: 1, tanaFieldId: 'field-definition', type: 'p' },
  { children: [{ text: '' }], id: 'value', indent: 2, tanaFieldValueType: 'plain', type: 'p' },
  { children: [{ text: 'Tag' }], id: 'tag', tanaSupertagDefinition: {}, type: 'p' },
  { children: [{ text: 'System' }], id: 'system', tanaSystemNode: 'home', type: 'p' },
];

test('Search ownership permits only canonical ordinary Nodes and a composed View', () => {
  const host = (index: number) => isTanaSearchHost(document[index] as TElement, { document, path: [index] });

  assert.equal(host(0), true);
  assert.equal(host(1), true);
  [3, 4, 5, 7, 8, 9, 10].forEach((index) => assert.equal(host(index), false));
});
