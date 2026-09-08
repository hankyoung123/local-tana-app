import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTanaIndex,
  isTanaTitleExpressionNameEditable,
  parseTanaTitleExpression,
  resolveTanaNodeTitle,
} from './index';
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

test('parses literal, formatted and system expression segments without mutation', () => {
  assert.deepEqual(parseTanaTitleExpression('<<${name}>> <b>${Status|2…}</b>'), [
    { kind: 'literal', text: '<<' },
    { kind: 'expression', name: 'name', placeholder: false, raw: '${name}' },
    { kind: 'literal', text: '>> <b>' },
    { kind: 'expression', name: 'Status', placeholder: false, limit: '2…', raw: '${Status|2…}' },
    { kind: 'literal', text: '</b>' },
  ]);

  const document: Value = [
    { id: 'tag', type: 'p', tanaSupertagDefinition: { titleExpression: '<b>${name}</b> ${sys:created}' }, children: [{ text: 'Tag' }] },
    { id: 'task', type: 'p', tanaSupertagIds: ['tag'], createdAt: '2026-09-08', children: [{ text: 'Task' }] },
  ];
  const title = resolveTanaNodeTitle(buildTanaIndex(document), 'task');

  assert.equal(title, '<b>Task</b> 2026-09-08');
});
