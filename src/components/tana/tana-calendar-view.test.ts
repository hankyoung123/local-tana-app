import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';

import { buildTanaIndex } from '@/lib/tana';

import {
  addTanaCalendarMonths,
  calendarDays,
  getTanaCalendarEntries,
  getTanaCalendarMonth,
  moveTanaCalendarCursor,
  setTanaCalendarDate,
} from './tana-calendar-view';

describe('Tana Calendar View', () => {
  test('derives placements only from Date Field Values, never a Day Node tanaTime', () => {
    const value: Value = [
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
      {
        children: [{ text: '2026-03-02' }],
        id: 'task-due-value',
        indent: 2,
        tanaFieldValueType: 'date',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Daily note' }],
        id: 'day-note',
        tanaTime: { unit: 'day', value: '2026-03-01' },
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const results = [
      index.nodesById.get('task')!,
    ];

    assert.deepEqual(
      getTanaCalendarEntries(index, results).map(({ day, node }) => [day, node.id]),
      [['2026-03-02', 'task']]
    );
  });

  test('filters date placements by the selected Field without duplicating Node data', () => {
    const value: Value = [
      { children: [{ text: 'Start' }], id: 'start', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-start', indent: 1, tanaFieldId: 'start', type: KEYS.p },
      { children: [{ text: '2026-03-01' }], id: 'task-start-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
      { children: [{ text: '2026-03-05' }], id: 'task-due-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
    ];
    const index = buildTanaIndex(value);
    const results = [index.nodesById.get('task')!];

    assert.deepEqual(
      getTanaCalendarEntries(index, results).map(({ day }) => day),
      ['2026-03-01', '2026-03-05']
    );
    assert.deepEqual(
      getTanaCalendarEntries(index, results, ['due']).map(({ day }) => day),
      ['2026-03-05']
    );
    assert.deepEqual(getTanaCalendarEntries(index, results, []), []);
  });

  test('navigates calendar months across year boundaries', () => {
    assert.equal(getTanaCalendarMonth('2026-03-02'), '2026-03');
    assert.equal(addTanaCalendarMonths('2026-01', -1), '2025-12');
    assert.equal(addTanaCalendarMonths('2026-12', 1), '2027-01');
  });
});


  test('uses canonical Date Fields for References and allows multiple enabled Date Fields', () => {
    const value: Value = [
      { children: [{ text: 'Start' }], id: 'start', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: '' }], id: 'target-start', indent: 1, tanaFieldId: 'start', type: KEYS.p },
      { children: [{ text: '2026-03-01' }], id: 'target-start-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
      { children: [{ text: '' }], id: 'target-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
      { children: [{ text: '2026-03-03' }], id: 'target-due-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ];
    const index = buildTanaIndex(value);
    const entries = getTanaCalendarEntries(index, [index.nodesById.get('reference')!], ['start', 'due']);
    assert.deepEqual(entries.map(({ day, fieldId, node, target }) => [day, fieldId, node.id, target.id]), [
      ['2026-03-01', 'start', 'reference', 'target'],
      ['2026-03-03', 'due', 'reference', 'target'],
    ]);
  });

  test('provides full Day, Monday-aligned Week and Month date ranges without events', () => {
    assert.deepEqual(calendarDays('day', '2026-03-02', []), ['2026-03-02']);
    assert.deepEqual(calendarDays('week', '2026-03-04'), [
      '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
    ]);
    assert.equal(calendarDays('month', '2026-02-17').length, 28);
    assert.equal(calendarDays('month', '2024-02-17').length, 29);
    assert.equal(calendarDays('month', '2026-04-17').length, 30);
    assert.equal(calendarDays('month', '2026-03-17').length, 31);
    assert.deepEqual(calendarDays('month', '2026-12-17').at(-1), '2026-12-31');
    assert.deepEqual(calendarDays('month', '2027-01-17')[0], '2027-01-01');
    assert.deepEqual(calendarDays('week', moveTanaCalendarCursor('week', '2026-03-04', -1))[0], '2026-02-23');
    assert.deepEqual(calendarDays('week', moveTanaCalendarCursor('week', '2026-03-04', 1))[0], '2026-03-09');
    assert.equal(moveTanaCalendarCursor('month', '2026-12-17', 1), '2027-01-01');
  });


test('Calendar Date drops materialize and update only the payload Date Field through the existing writer', () => {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Start' }], id: 'start', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: '' }], id: 'target-start', indent: 1, tanaFieldId: 'start', type: KEYS.p },
      { children: [{ text: '2026-03-01' }], id: 'target-start-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ],
  });
  assert.equal(setTanaCalendarDate(editor, 'reference', 'due', '2026-03-02'), true);
  assert.equal(setTanaCalendarDate(editor, 'reference', 'due', '2026-03-04'), true);
  const index = buildTanaIndex(editor.children);
  assert.deepEqual(index.fieldNodesByParent.get('target')?.map((field) => [field.fieldId, field.values]), [
    ['start', [{ type: 'date', value: '2026-03-01' }]],
    ['due', [{ type: 'date', value: '2026-03-04' }]],
  ]);
  assert.equal(index.fieldNodesByParent.has('reference'), false);
});

test('Calendar empty Date Field selection leaves every result undated and survives a document copy', () => {
  const value: Value = [
    { children: [{ text: 'Start' }], id: 'start', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
    { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
    { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
    { children: [{ text: '' }], id: 'task-start', indent: 1, tanaFieldId: 'start', type: KEYS.p },
    { children: [{ text: '2026-03-01' }], id: 'task-start-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
    { children: [{ text: '' }], id: 'task-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
    { children: [{ text: '2026-03-05' }], id: 'task-due-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
    { children: [{ text: 'Calendar' }], id: 'calendar', tanaViewDefinition: { calendarDateFieldIds: [], type: 'calendar' }, type: KEYS.p },
  ];
  const index = buildTanaIndex(value);
  const result = index.nodesById.get('task')!;
  const calendar = index.nodesById.get('calendar')!;

  assert.deepEqual(
    getTanaCalendarEntries(index, [result]).map(({ day, fieldId }) => [day, fieldId]),
    [['2026-03-01', 'start'], ['2026-03-05', 'due']]
  );
  assert.deepEqual(getTanaCalendarEntries(index, [result], calendar.viewDefinition?.calendarDateFieldIds), []);
  const reloaded = buildTanaIndex(structuredClone(value));
  assert.deepEqual(reloaded.nodesById.get('calendar')?.viewDefinition?.calendarDateFieldIds, []);
  assert.deepEqual(getTanaCalendarEntries(reloaded, [reloaded.nodesById.get('task')!], reloaded.nodesById.get('calendar')?.viewDefinition?.calendarDateFieldIds), []);
});
