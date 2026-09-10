import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';

import { buildTanaIndex } from './index';
import { resolveTanaViewProjection } from './view-projection';

function itemIds(projection: ReturnType<typeof resolveTanaViewProjection>) {
  return projection.items.map(({ occurrence }) => occurrence.id);
}

const document: Value = [
  { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
  { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
  { children: [{ text: 'Project' }], id: 'project', tanaSupertagDefinition: {}, type: KEYS.p },
  { children: [{ text: 'Alpha canonical' }], id: 'alpha', tanaSupertagIds: ['project'], type: KEYS.p },
  { children: [{ text: '' }], id: 'alpha-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
  { children: [{ text: 'ready' }], id: 'alpha-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
  { children: [{ text: '' }], id: 'alpha-due', indent: 1, tanaFieldId: 'due', type: KEYS.p },
  { children: [{ text: '2026-09-18' }], id: 'alpha-due-value', indent: 2, tanaFieldValueType: 'date', type: KEYS.p },
  { children: [{ text: 'Beta canonical' }], id: 'beta', tanaSupertagIds: ['project'], type: KEYS.p },
  { children: [{ text: '' }], id: 'beta-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
  { children: [{ text: 'ready' }], id: 'beta-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
  { children: [{ text: 'Parent' }], id: 'parent', type: KEYS.p },
  { children: [{ text: 'Reference Alpha' }], id: 'alpha-reference', indent: 1, tanaReferenceTargetId: 'alpha', type: KEYS.p },
  { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'cards' }, type: KEYS.p },
];

describe('shared Tana View projection', () => {
  test('reads filter, sort and display semantics from a Reference canonical target while retaining occurrence identity', () => {
    const index = buildTanaIndex(document);
    const view = {
      ...index.nodesById.get('view')!,
      viewDefinition: {
        filter: {
          clauses: [
            { kind: 'has-supertag' as const, supertagId: 'project' },
            { fieldId: 'status', kind: 'field-equals' as const, value: { type: 'plain' as const, value: 'ready' } },
          ],
          mode: 'and' as const,
        },
        sort: [{ direction: 'desc' as const, fieldId: '$title' as const }],
        type: 'cards' as const,
        visibleFieldIds: ['status'],
      },
    };
    const projection = resolveTanaViewProjection(index, view, [
      index.nodesById.get('alpha-reference')!,
      index.nodesById.get('beta')!,
    ]);

    assert.deepEqual(itemIds(projection), ['beta', 'alpha-reference']);
    assert.equal(projection.items[1]?.target.id, 'alpha');
    assert.deepEqual(projection.visibleFieldIds, ['status']);
    assert.deepEqual(projection.groups.map(({ items }) => items.map(({ occurrence }) => occurrence.id)), [
      ['beta', 'alpha-reference'],
    ]);
  });

  test('multi-sort is stable and group capability only applies to Outline and Cards', () => {
    const index = buildTanaIndex(document);
    const source = [index.nodesById.get('beta')!, index.nodesById.get('alpha')!];
    const base = {
      groupFieldId: 'status',
      sort: [
        { direction: 'asc' as const, fieldId: 'status' },
        { direction: 'asc' as const, fieldId: '$title' as const },
      ],
    };
    const cards = resolveTanaViewProjection(index, { ...index.nodesById.get('view')!, viewDefinition: { ...base, type: 'cards' as const } }, source);
    const table = resolveTanaViewProjection(index, { ...index.nodesById.get('view')!, viewDefinition: { ...base, type: 'table' as const } }, source);

    assert.deepEqual(itemIds(cards), ['alpha', 'beta']);
    assert.equal(cards.groups.length, 1);
    assert.equal(table.groups.length, 1);
    assert.equal(table.groups[0]?.label, '');
  });

  test('applies the same canonical filter to Outline, Table, Cards and Calendar sources', () => {
    const index = buildTanaIndex(document);
    const source = [index.nodesById.get('alpha-reference')!, index.nodesById.get('beta')!];
    const expected = ['alpha-reference'];
    for (const type of ['outline', 'table', 'cards', 'calendar'] as const) {
      const projection = resolveTanaViewProjection(index, {
        ...index.nodesById.get('view')!,
        viewDefinition: { filter: { clauses: [{ kind: 'text-contains', text: 'Alpha' }], mode: 'and' }, type },
      }, source);
      assert.deepEqual(itemIds(projection), expected);
    }
  });

  test('supports title contains plus Field SET and NOT SET without treating a missing Field config as document data', () => {
    const index = buildTanaIndex(document);
    const source = [index.nodesById.get('alpha')!, index.nodesById.get('beta')!];
    const withStatus = resolveTanaViewProjection(index, {
      ...index.nodesById.get('view')!,
      viewDefinition: { filter: { clauses: [{ fieldId: 'status', kind: 'field-set' }], mode: 'and' }, type: 'outline' },
    }, source);
    const noDue = resolveTanaViewProjection(index, {
      ...index.nodesById.get('view')!,
      viewDefinition: { filter: { clauses: [
        { kind: 'text-contains', text: 'canonical' },
        { fieldId: 'due', kind: 'field-not-set' },
      ], mode: 'and' }, type: 'outline' },
    }, source);
    const missing = resolveTanaViewProjection(index, {
      ...index.nodesById.get('view')!,
      viewDefinition: { filter: { clauses: [{ fieldId: 'missing', kind: 'field-set' }], mode: 'and' }, type: 'outline' },
    }, source);
    assert.deepEqual(itemIds(withStatus), ['alpha', 'beta']);
    assert.deepEqual(itemIds(noDue), ['beta']);
    assert.deepEqual(itemIds(missing), ['alpha', 'beta']);
  });

  test('treats an empty materialized Value as unset and invalid stored content as set', () => {
    const value: Value = [
      { children: [{ text: 'Estimate' }], id: 'estimate', tanaFieldDefinition: { type: 'number' }, type: KEYS.p },
      { children: [{ text: 'Empty' }], id: 'empty', type: KEYS.p },
      { children: [{ text: '' }], id: 'empty-estimate', indent: 1, tanaFieldId: 'estimate', type: KEYS.p },
      { children: [{ text: '' }], id: 'empty-estimate-value', indent: 2, tanaFieldValueType: 'number', type: KEYS.p },
      { children: [{ text: 'Historical' }], id: 'historical', type: KEYS.p },
      { children: [{ text: '' }], id: 'historical-estimate', indent: 1, tanaFieldId: 'estimate', type: KEYS.p },
      { children: [{ text: 'draft' }], id: 'historical-estimate-value', indent: 2, tanaFieldValueType: 'number', type: KEYS.p },
      { children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'outline' }, type: KEYS.p },
    ];
    const index = buildTanaIndex(value);
    const view = index.nodesById.get('view')!;
    const set = resolveTanaViewProjection(index, { ...view, viewDefinition: { filter: { clauses: [{ fieldId: 'estimate', kind: 'field-set' }], mode: 'and' }, type: 'outline' } }, [index.nodesById.get('empty')!, index.nodesById.get('historical')!]);
    assert.deepEqual(itemIds(set), ['historical']);
  });

  test('caps a collection page at 100 without retaining a View result cache', () => {
    const rows: Value = Array.from({ length: 101 }, (_, position) => ({
      children: [{ text: `Row ${position}` }], id: `row-${position}`, type: KEYS.p,
    }));
    rows.unshift({ children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { pagination: { pageSize: 100 }, type: 'list' }, type: KEYS.p });
    const index = buildTanaIndex(rows);
    const before = structuredClone(rows);
    const projection = resolveTanaViewProjection(index, index.nodesById.get('view')!, Array.from({ length: 101 }, (_, position) => index.nodesById.get(`row-${position}`)!));

    assert.equal(projection.items.length, 100);
    assert.equal(projection.total, 101);
    assert.equal(projection.pageCount, 2);
    assert.deepEqual(rows, before);
  });
});
