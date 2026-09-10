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

  test('provides Day, Week and Month derived day ranges', () => {
    assert.deepEqual(calendarDays('day', '2026-03-02', []), ['2026-03-02']);
    assert.equal(calendarDays('week', '2026-03-02', []).length, 7);
    assert.deepEqual(calendarDays('month', '2026-03-02', [
      { day: '2026-03-02', fieldId: 'due', node: {} as never, target: {} as never },
      { day: '2026-03-03', fieldId: 'due', node: {} as never, target: {} as never },
    ]), ['2026-03-02', '2026-03-03']);
  });


test('Calendar Date drops materialize and update the canonical Field through the existing writer', () => {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: 'Reference' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ],
  });
  assert.equal(setTanaCalendarDate(editor, 'reference', 'due', '2026-03-02'), true);
  assert.equal(setTanaCalendarDate(editor, 'reference', 'due', '2026-03-04'), true);
  const index = buildTanaIndex(editor.children);
  assert.deepEqual(index.fieldNodesByParent.get('target')?.[0]?.values, [{ type: 'date', value: '2026-03-04' }]);
  assert.equal(index.fieldNodesByParent.has('reference'), false);
});
