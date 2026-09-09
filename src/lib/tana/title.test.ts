import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTanaIndex,
  isTanaTitleExpressionNameEditable,
  parseTanaTitleExpression,
  resolveTanaNodeTitle,
  resolveTanaNodeTitleSegments,
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
    { kind: 'literal', text: '>> ' },
    { kind: 'expression', name: 'Status', placeholder: false, limit: '2…', raw: '${Status|2…}', marks: { bold: true } },
  ]);

  const document: Value = [
    { id: 'tag', type: 'p', tanaSupertagDefinition: { titleExpression: '<b>${name}</b> ${sys:created}' }, children: [{ text: 'Tag' }] },
    { id: 'task', type: 'p', tanaSupertagIds: ['tag'], createdAt: '2026-09-08', children: [{ text: 'Task' }] },
  ];
  const title = resolveTanaNodeTitle(buildTanaIndex(document), 'task');

  assert.equal(title, 'Task 2026-09-08');
});

test('resolves nested fields, owner fields, list values, and safe formatting segments', () => {
  const document: Value = [
    { id: 'relation', type: 'p', tanaFieldDefinition: { type: 'options', cardinality: 'single' }, children: [{ text: 'Relation' }] },
    { id: 'person', type: 'p', indent: 1, children: [{ text: 'Person' }] },
    { id: 'name-field', type: 'p', indent: 2, tanaFieldId: 'name', children: [{ text: '' }] },
    { id: 'name-value', type: 'p', indent: 3, tanaFieldValueType: 'plain', children: [{ text: 'Ada' }] },
    { id: 'person-metadata', type: 'p', indent: 2, tanaFieldId: 'metadata', children: [{ text: '' }] },
    { id: 'person-metadata-value', type: 'p', indent: 3, tanaFieldValueType: 'options', children: [{ children: [{ text: '' }], key: 'record', type: 'mention' }] },
    { id: 'name', type: 'p', tanaFieldDefinition: { type: 'plain' }, children: [{ text: 'Name' }] },
    { id: 'metadata', type: 'p', tanaFieldDefinition: { type: 'options' }, children: [{ text: 'Metadata' }] },
    { id: 'record', type: 'p', indent: 1, children: [{ text: 'Record' }] },
    { id: 'record-code', type: 'p', indent: 2, tanaFieldId: 'code', children: [{ text: '' }] },
    { id: 'record-code-value', type: 'p', indent: 3, tanaFieldValueType: 'plain', children: [{ text: 'A-1' }] },
    { id: 'code', type: 'p', tanaFieldDefinition: { type: 'plain' }, children: [{ text: 'Code' }] },
    { id: 'label', type: 'p', tanaFieldDefinition: { type: 'plain' }, children: [{ text: 'Label' }] },
    { id: 'owner', type: 'p', children: [{ text: 'Owner' }] },
    { id: 'owner-label', type: 'p', indent: 1, tanaFieldId: 'label', children: [{ text: '' }] },
    { id: 'label-value', type: 'p', indent: 2, tanaFieldValueType: 'plain', children: [{ text: 'Inbox' }] },
    {
      id: 'task',
      type: 'p',
      indent: 1,
      createdAt: '2026-09-08',
      tanaCreatedTime: '09:30',
      tanaSupertagIds: ['tag'],
      children: [{ text: 'Task' }],
    },
    { id: 'task-relation', type: 'p', indent: 2, tanaFieldId: 'relation', children: [{ text: '' }] },
    { id: 'task-relation-value', type: 'p', indent: 3, tanaFieldValueType: 'options', children: [{ children: [{ text: '' }], key: 'person', type: 'mention' }] },
    { id: 'tag', type: 'p', tanaSupertagDefinition: { titleExpression: '<b>${name}</b> · ${Relation.Name} / ${Relation.Metadata.Code} · ${sys:owner.label} · ${sys:createdAt} ${ctime}' }, children: [{ text: 'Tag' }] },
  ];
  const index = buildTanaIndex(document);

  assert.equal(resolveTanaNodeTitle(index, 'task'), 'Task · Ada / A-1 · Inbox · 2026-09-08 09:30');
  assert.deepEqual(resolveTanaNodeTitleSegments(index, 'task'), [
    { text: 'Task', marks: { bold: true } },
    { text: ' · ' },
    { text: 'Ada' },
    { text: ' / ' },
    { text: 'A-1' },
    { text: ' · ' },
    { text: 'Inbox' },
    { text: ' · ' },
    { text: '2026-09-08' },
    { text: ' ' },
    { text: '09:30' },
  ]);
});

test('keeps unknown or unbalanced formatting literal and never mutates the document', () => {
  const expression = '<b>${name} <u>raw</u>';
  const document: Value = [
    { id: 'tag', type: 'p', tanaSupertagDefinition: { titleExpression: expression }, children: [{ text: 'Tag' }] },
    { id: 'task', type: 'p', tanaSupertagIds: ['tag'], children: [{ text: 'Task' }] },
  ];
  const before = structuredClone(document);
  const index = buildTanaIndex(document);

  assert.equal(resolveTanaNodeTitle(index, 'task'), '<b>Task <u>raw</u>');
  assert.deepEqual(document, before);
});

test('resolves list values, limits, placeholders, and currently expressible system attributes', () => {
  const document: Value = [
    { id: 'labels', type: 'p', tanaFieldDefinition: { cardinality: 'list', type: 'plain' }, children: [{ text: 'Labels' }] },
    {
      id: 'tag',
      type: 'p',
      tanaSupertagDefinition: {
        titleExpression: '${Labels|8…} / ${Missing|?} / ${Missing|8…?} / ${cdate} ${ctime} ${mdate} ${mtime} ${sys:description} ${sys:createdAt} ${sys:lastEditedAt} ${sys:lastEditedBy} ${sys:editedBy} ${sys:dateFromCalendarNode} ${sys:doneTime}',
      },
      children: [{ text: 'Tag' }],
    },
    {
      id: 'task',
      type: 'p',
      tanaCreatedDate: '2026-09-01',
      tanaCreatedTime: '08:00',
      tanaModifiedDate: '2026-09-02',
      tanaModifiedTime: '09:00',
      tanaDescription: 'Description',
      tanaCreatedAt: '2026-09-01T08:00:00Z',
      tanaLastEditedAt: '2026-09-02T09:00:00Z',
      tanaLastEditedBy: 'Ada',
      editedBy: 'Grace',
      tanaDateFromCalendarNode: '2026-09-03',
      tanaDoneTime: '2026-09-04T10:00:00Z',
      tanaSupertagIds: ['tag'],
      children: [{ text: 'Task' }],
    },
    { id: 'task-labels', type: 'p', indent: 1, tanaFieldId: 'labels', children: [{ text: '' }] },
    { id: 'task-label-1', type: 'p', indent: 2, tanaFieldValueType: 'plain', children: [{ text: 'alpha' }] },
    { id: 'task-label-2', type: 'p', indent: 2, tanaFieldValueType: 'plain', children: [{ text: 'beta' }] },
  ];
  const before = structuredClone(document);

  assert.equal(
    resolveTanaNodeTitle(buildTanaIndex(document), 'task'),
    'alpha, b… / ${Missing|?} / ${Missing|8…?} / 2026-09-01 08:00 2026-09-02 09:00 Description 2026-09-01T08:00:00Z 2026-09-02T09:00:00Z Ada Grace 2026-09-03 2026-09-04T10:00:00Z'
  );
  assert.deepEqual(document, before);
});
