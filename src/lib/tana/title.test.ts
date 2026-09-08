import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTanaIndex, isTanaTitleExpressionNameEditable, resolveTanaNodeTitle } from './index';
import type { Value } from 'platejs';

test('resolves name, Fields, truncation and system expressions without mutation', () => {
  const document: Value = [
    { id: 'owner', type: 'p', children: [{ text: 'Owner' }] },
    { id: 'status', type: 'p', tanaFieldDefinition: { type: 'plain' }, children: [{ text: 'Status' }] },
    {
      id: 'task',
      type: 'p',
      indent: 1,
      tanaSupertagIds: ['tag'],
      tanaDoneState: 'done',
      children: [{ text: 'Ship the feature' }],
    },
    { id: 'task-status', type: 'p', indent: 2, tanaFieldId: 'status', children: [{ text: '' }] },
    { id: 'task-status-value', type: 'p', indent: 3, tanaFieldValueType: 'plain', children: [{ text: 'Doing' }] },
    { id: 'tag', type: 'p', tanaSupertagDefinition: { titleExpression: '${name} · ${Status|4…?} · ${sys:owner} · ${sys:doneTime}' }, children: [{ text: 'Tag' }] },
  ];
  const index = buildTanaIndex(document);
  const before = structuredClone(document);
  const title = resolveTanaNodeTitle(index, 'task');

  assert.equal(title, 'Ship the feature · Doin… · Status · ');
  assert.equal(isTanaTitleExpressionNameEditable('${name} · ${Status}'), true);
  assert.equal(isTanaTitleExpressionNameEditable('${Status} · ${name}'), false);
  assert.deepEqual(document, before);
});
