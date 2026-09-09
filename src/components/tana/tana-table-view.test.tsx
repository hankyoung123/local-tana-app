import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor, Plate } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { buildTanaIndex } from '@/lib/tana';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { TanaIndexProvider } from './tana-index-context';

import {
  getTanaTableAvailableFieldIds,
  getTanaTableFieldIds,
  groupTanaTableNodes,
  setTanaTableFieldValue,
  sortTanaTableNodes,
  TanaTableView,
} from './tana-table-view';

function createEditor(value: Value) {
  let nextId = 0;

  return createPlateEditor({
    nodeId: {
      filter: isTanaNodeElement,
      idCreator: () => `table-test-${++nextId}`,
      initialValueIds: 'always',
    },
    plugins: EditorKit,
    value,
  });
}

describe('Tana Table View', () => {
  test('derives columns, ordering, and groups from canonical Field Nodes', () => {
    const value: Value = [
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      { children: [{ text: 'Beta' }], id: 'beta', type: KEYS.p },
      { children: [{ text: '' }], id: 'beta-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [{ text: 'Doing' }],
        id: 'beta-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
      { children: [{ text: 'Alpha' }], id: 'alpha', type: KEYS.p },
      { children: [{ text: '' }], id: 'alpha-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      {
        children: [{ text: 'Todo' }],
        id: 'alpha-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const nodes = [index.nodesById.get('beta')!, index.nodesById.get('alpha')!];

    assert.deepEqual(getTanaTableFieldIds(index, nodes), ['status']);
    assert.deepEqual(
      sortTanaTableNodes(index, nodes, { direction: 'asc', fieldId: 'status' }).map(
        (node) => node.id
      ),
      ['beta', 'alpha']
    );
    assert.deepEqual(
      groupTanaTableNodes(index, nodes, 'status').map(({ label, nodes: group }) => [
        label,
        group.map((node) => node.id),
      ]),
      [
        ['Doing', ['beta']],
        ['Todo', ['alpha']],
      ]
    );
    assert.deepEqual(nodes.map((node) => node.id), ['beta', 'alpha']);
  });

  test('keeps configured and optional Supertag template Fields available before instances materialize them', () => {
    const value: Value = [
      {
        children: [{ text: 'Configured' }],
        id: 'configured',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
      {
        children: [{ text: 'Due date' }],
        id: 'due-date',
        indent: 1,
        tanaFieldDefinition: { type: 'date' },
        tanaFieldOptional: true,
        type: KEYS.p,
      },
      {
        children: [{ text: 'Occurrence only' }],
        id: 'occurrence-only',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Instance' }],
        id: 'instance',
        tanaSupertagIds: ['project'],
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'instance-occurrence',
        indent: 1,
        tanaFieldId: 'occurrence-only',
        type: KEYS.p,
      },
    ];
    const index = buildTanaIndex(value);
    const instance = index.nodesById.get('instance')!;

    assert.deepEqual(
      getTanaTableAvailableFieldIds(index, [instance], ['configured']),
      ['configured', 'due-date', 'occurrence-only']
    );
    assert.deepEqual(getTanaTableAvailableFieldIds(index, [], ['configured']), ['configured']);
  });

  test('materializes an optional Table Field only when its first value is committed', () => {
    const editor = createEditor([
      { children: [{ text: 'Project' }], id: 'project', type: KEYS.p },
      {
        children: [{ text: 'Due date' }],
        id: 'due-date',
        tanaFieldDefinition: { type: 'date' },
        type: KEYS.p,
      },
    ]);

    assert.equal(buildTanaIndex(editor.children).fieldNodesByParent.has('project'), false);
    const beforeCancel = structuredClone(editor.children);
    assert.equal(
      editor.getTransforms(TanaFieldPlugin).field.clearValue('project', 'due-date'),
      false
    );
    assert.deepEqual(editor.children, beforeCancel);

    assert.equal(
      setTanaTableFieldValue(editor, 'project', 'due-date', {
        type: 'date',
        value: '2026-09-05',
      }),
      true
    );

    const index = buildTanaIndex(editor.children);
    const field = index.fieldNodesByParent.get('project')?.[0];

    assert.ok(field);
    assert.equal(field.fieldId, 'due-date');
    assert.deepEqual(field.values, [{ type: 'date', value: '2026-09-05' }]);
    assert.equal(field.valueNodeIds.length, 1);
  });

  test('writes a Reference Table cell through to its live canonical target', () => {
    const editor = createEditor([
      { children: [{ text: 'Status' }], id: 'status', tanaFieldDefinition: { type: 'plain' }, type: KEYS.p },
      { children: [{ text: 'Target' }], id: 'target', type: KEYS.p },
      { children: [{ text: '' }], id: 'target-status', indent: 1, tanaFieldId: 'status', type: KEYS.p },
      { children: [{ text: 'Before' }], id: 'target-status-value', indent: 2, tanaFieldValueType: 'plain', type: KEYS.p },
      { children: [{ text: 'Reference occurrence' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
    ]);

    assert.equal(
      setTanaTableFieldValue(editor, 'reference', 'status', { type: 'plain', value: 'After' }),
      true
    );

    const index = buildTanaIndex(editor.children);
    assert.deepEqual(index.fieldNodesByParent.get('target')?.[0]?.values, [
      { type: 'plain', value: 'After' },
    ]);
    assert.equal(index.fieldNodesByParent.has('reference'), false);
    assert.deepEqual(getTanaTableFieldIds(index, [index.nodesById.get('reference')!]), ['status']);
  });

  test('renders stored invalid scalar text as an editable warning rather than dropping it', () => {
    const value: Value = [
      { children: [{ text: 'Estimate' }], id: 'estimate', tanaFieldDefinition: { max: 8, type: 'number' }, type: KEYS.p },
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      { children: [{ text: '' }], id: 'task-estimate', indent: 1, tanaFieldId: 'estimate', type: KEYS.p },
      { children: [{ text: 'draft' }], id: 'task-estimate-value', indent: 2, tanaFieldValueType: 'number', type: KEYS.p },
      { children: [{ text: 'Table' }], id: 'view', tanaViewDefinition: { type: 'table' }, type: KEYS.p },
    ];
    const editor = createEditor(value);
    const index = buildTanaIndex(value);
    const html = renderToStaticMarkup(
      <Plate editor={editor}>
        <TanaIndexProvider>
          <TanaTableView
            index={index}
            results={[index.nodesById.get('task')!]}
            view={index.nodesById.get('view')!}
          />
        </TanaIndexProvider>
      </Plate>
    );

    assert.match(html, /value="draft"/);
    assert.match(html, /需修正：数字或范围无效/);
    assert.match(html, /aria-invalid="true"/);
  });

  test('renders computed title formatting in a Table title cell from safe segments', () => {
    const value: Value = [
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Task' }],
        id: 'task',
        tanaSupertagIds: ['tag'],
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'task-status',
        indent: 1,
        tanaFieldId: 'status',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Ready' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
      {
        children: [{ text: 'Project' }],
        id: 'tag',
        tanaSupertagDefinition: { titleExpression: '<b>${Status}</b>' },
        type: KEYS.p,
      },
      {
        children: [{ text: 'Table' }],
        id: 'view',
        tanaViewDefinition: { type: 'table' },
        type: KEYS.p,
      },
    ];
    const editor = createEditor(value);
    const index = buildTanaIndex(value);
    const html = renderToStaticMarkup(
      <Plate editor={editor}>
        <TanaIndexProvider>
          <TanaTableView
            index={index}
            results={[index.nodesById.get('task')!]}
            view={index.nodesById.get('view')!}
          />
        </TanaIndexProvider>
      </Plate>
    );

    assert.match(html, /<strong>Ready<\/strong>/);
    assert.doesNotMatch(html, /&lt;b&gt;|<b>Ready<\/b>/);
    assert.equal(value[1].children[0].text, 'Task');
  });
});
