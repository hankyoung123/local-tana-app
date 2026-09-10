import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { buildTanaIndex } from '@/lib/tana';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { initialDocument } from '@/lib/tana/initial-document';

import { createTanaViewNode } from './tana-view-actions';
import { createTanaCalendarNode } from './tana-calendar-view';

function editor(value: Value) {
  let id = 0;
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, idCreator: () => `view-row-${++id}`, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('View collection add actions', () => {
  test('ordinary View adds a real direct canonical child and Search adds a canonical sibling rather than a result child', () => {
    const ordinary = editor([{ children: [{ text: 'View' }], id: 'view', tanaViewDefinition: { type: 'table' }, type: KEYS.p }]);
    const rowId = createTanaViewNode(ordinary, 'view');
    assert.ok(rowId);
    assert.equal(ordinary.children[1]?.indent, 1);
    assert.equal(buildTanaIndex(ordinary.children).parentNodeIds.get(rowId!), 'view');

    const search = editor([{ children: [{ text: 'Search' }], id: 'search', tanaSearchDefinition: { query: { children: [], type: 'and' } }, tanaViewDefinition: { type: 'table' }, type: KEYS.p }]);
    const resultId = createTanaViewNode(search, 'search');
    assert.ok(resultId);
    assert.equal(search.children[1]?.indent, 0);
    assert.equal(buildTanaIndex(search.children).parentNodeIds.get(resultId!), undefined);
    assert.equal(search.children.some((node) => node.id === resultId && node.tanaSearchDefinition !== undefined), false);
  });

  test('a Supertag instances View delegates new rows to the existing canonical instance writer', () => {
    const workspace = editor(structuredClone(initialDocument) as Value);
    assert.equal(workspace.getTransforms(TanaViewPlugin).view.define('supertag-project'), true);
    const instanceId = createTanaViewNode(workspace, 'supertag-project');
    assert.ok(instanceId);
    const index = buildTanaIndex(workspace.children);
    assert.ok(index.nodesById.get(instanceId!)?.supertagIds.includes('supertag-project'));
    assert.equal(index.parentNodeIds.get(instanceId!), 'home');
  });

  test('Calendar add creates a canonical child then writes its configured Date Field', () => {
    const calendar = editor([
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      { children: [{ text: 'Calendar' }], id: 'calendar', tanaViewDefinition: { calendarDateFieldIds: ['due'], type: 'calendar' }, type: KEYS.p },
    ]);
    const nodeId = createTanaCalendarNode(calendar, 'calendar', 'due', '2026-09-18');
    assert.ok(nodeId);
    let index = buildTanaIndex(calendar.children);
    assert.deepEqual(index.fieldNodesByParent.get(nodeId!)?.[0]?.values, [{ type: 'date', value: '2026-09-18' }]);

    calendar.tf.undo();
    index = buildTanaIndex(calendar.children);
    assert.equal(index.nodesById.has(nodeId!), false);

    calendar.tf.redo();
    index = buildTanaIndex(calendar.children);
    assert.deepEqual(index.fieldNodesByParent.get(nodeId!)?.[0]?.values, [{ type: 'date', value: '2026-09-18' }]);
  });

  test('a Search + Calendar View add remains a canonical sibling before its Date Field writer runs', () => {
    const calendar = editor([
      { children: [{ text: 'Due' }], id: 'due', tanaFieldDefinition: { type: 'date' }, type: KEYS.p },
      {
        children: [{ text: 'Search calendar' }], id: 'search-calendar', type: KEYS.p,
        tanaSearchDefinition: { query: { children: [], type: 'and' } },
        tanaViewDefinition: { calendarDateFieldIds: ['due'], type: 'calendar' },
      },
    ]);

    const nodeId = createTanaCalendarNode(calendar, 'search-calendar', 'due', '2026-09-18');
    assert.ok(nodeId);
    assert.equal(buildTanaIndex(calendar.children).parentNodeIds.get(nodeId!), undefined);
    assert.deepEqual(buildTanaIndex(calendar.children).fieldNodesByParent.get(nodeId!)?.[0]?.values, [{ type: 'date', value: '2026-09-18' }]);
    calendar.tf.undo();
    assert.equal(buildTanaIndex(calendar.children).nodesById.has(nodeId!), false);
  });
});
