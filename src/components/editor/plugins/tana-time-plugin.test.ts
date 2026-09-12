import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { TogglePlugin } from '@platejs/toggle/react';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { isFieldValueValid } from '@/lib/tana/fields';
import { buildTanaIndex } from '@/lib/tana/index';
import { isValidTanaDocument } from '@/lib/tana/persistence';
import { TanaNodeLifecyclePlugin } from './tana-node-lifecycle-plugin';
import { TanaNodeIdentityPlugin } from './tana-node-identity-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';
import { TanaTimePlugin } from './tana-time-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

function workspace(): Value {
  return [
    { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
    { children: [{ text: 'Task' }], id: 'task', indent: 2, type: KEYS.p },
    { children: [{ text: 'Daily Notes' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
    {
      children: [{ text: 'Due date' }],
      id: 'due-date',
      indent: 2,
      tanaFieldDefinition: { type: 'date' },
      type: KEYS.p,
    },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  ];
}

describe('Tana time semantics', () => {
  test('lazily creates ordered Day Nodes below Daily Notes and reuses their NodeId', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    const second = time.goToDay('2026-01-02');
    const first = time.goToDay('2026-01-01');

    assert.ok(first);
    assert.ok(second);
    assert.equal(time.goToDay('2026-01-02'), second);
    const generated = editor.children.slice(4, 8).map((node) => node.id);
    assert.deepEqual(editor.children.map((node) => node.id), ['workspace', 'home', 'task', 'daily', ...generated, 'schema', 'due-date', 'library', 'settings', 'trash']);
    assert.deepEqual(
      editor.children.slice(4, 6).map((node) => [node.indent, node.tanaTime]),
      [
        [2, { unit: 'year', value: '2026' }],
        [3, { unit: 'week', value: '2026-W01' }],
      ]
    );
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get(first), editor.children[5]?.id);
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get(second), editor.children[5]?.id);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), second);
    assert.equal(buildTanaIndex(editor.children).timeNodeIds.get('day:2026-01-02'), second);
    assert.equal(isValidTanaDocument(editor.children), true);
  });

  test('restores a trashed canonical Day Node to Daily Notes instead of creating a duplicate', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;
    const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;
    const day = time.goToDay('2026-01-02');

    assert.ok(day);
    assert.equal(lifecycle.trash(day), true);
    assert.equal(buildTanaIndex(editor.children).parentNodeIds.get(day), 'trash');
    assert.equal(time.goToDay('2026-01-02'), day);

    const index = buildTanaIndex(editor.children);

    const weekId = index.nodesById.get(day)?.id && index.parentNodeIds.get(day);
    assert.equal(index.nodesById.get(weekId ?? '')?.time?.unit, 'week');
    assert.equal(index.timeNodeIds.get('day:2026-01-02'), day);
    assert.equal(
      editor.children.filter(
        (node) => (node as { tanaTime?: { value?: string } }).tanaTime?.value === '2026-01-02'
      ).length,
      1
    );
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), day);
  });

  test('uses the same strict calendar-day identity for Date Fields and Day Nodes', () => {
    const editor = createEditor(workspace());
    const index = buildTanaIndex(editor.children);

    assert.equal(
      isFieldValueValid(index, 'due-date', { type: 'date', value: '2026-02-29' }),
      false
    );
    assert.equal(
      isFieldValueValid(index, 'due-date', { type: 'date', value: '2028-02-29' }),
      true
    );
    assert.ok(editor.getTransforms(TanaTimePlugin).time.goToDay('2028-02-29'));
    assert.equal(buildTanaIndex(editor.children).timeNodeIds.has('day:2028-02-29'), true);
  });

  test('does not create a Day Node for an invalid date', () => {
    const editor = createEditor(workspace());

    assert.equal(editor.getTransforms(TanaTimePlugin).time.goToDay('2026-02-29'), undefined);
    assert.equal(editor.children.some((node) => node.tanaTime), false);
  });

  test('keeps ISO week-year hierarchy and restores the same Calendar Node identities', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;
    const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;
    const before = structuredClone(editor.children);
    const dayId = time.goToDay('2021-01-01');

    assert.ok(dayId);
    let index = buildTanaIndex(editor.children);
    const weekId = index.parentNodeIds.get(dayId!);
    const yearId = weekId ? index.parentNodeIds.get(weekId) : undefined;

    assert.equal(index.nodesById.get(yearId ?? '')?.time?.value, '2020');
    assert.equal(index.nodesById.get(weekId ?? '')?.time?.value, '2020-W53');
    assert.equal(index.parentNodeIds.get(yearId ?? ''), 'daily');
    assert.equal(time.goToWeek('2020-W53'), weekId);
    // A parent is intentionally not interactable while its child is Zoomed.
    // Return to the workspace before performing the real lifecycle action.
    assert.equal(editor.getTransforms(TanaZoomPlugin).zoom.root(), true);
    assert.equal(lifecycle.trash(yearId!), true);
    const afterTrash = structuredClone(editor.children);
    assert.equal(index.nodesById.get(dayId)?.time?.value, '2021-01-01');
    assert.equal(time.goToWeek('2020-W53'), weekId);

    index = buildTanaIndex(editor.children);
    assert.equal(index.parentNodeIds.get(weekId!), yearId);
    assert.equal(index.parentNodeIds.get(dayId!), weekId);
    assert.equal(index.timeNodeIds.get('year:2020'), yearId);
    assert.equal(index.timeNodeIds.get('week:2020-W53'), weekId);
    assert.equal(index.timeNodeIds.get('day:2021-01-01'), dayId);
    assert.equal(isValidTanaDocument(editor.children), true);
    const afterRestore = structuredClone(editor.children);

    editor.tf.undo();
    assert.deepEqual(editor.children, afterTrash);
    editor.tf.undo();
    assert.deepEqual(editor.children, before);
    editor.tf.redo();
    assert.deepEqual(editor.children, afterTrash);
    editor.tf.redo();
    assert.deepEqual(editor.children, afterRestore);
  });

  test('navigates Week Nodes by complete ISO weeks', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    const weekId = time.goToWeek('2026-W02');
    assert.ok(weekId);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), weekId);

    const nextId = time.nextDay();
    assert.ok(nextId);
    assert.notEqual(nextId, weekId);
    assert.equal(
      buildTanaIndex(editor.children).nodesById.get(nextId!)?.time?.value,
      '2026-W03',
    );
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), nextId);

    const previousId = time.previousDay();
    assert.equal(previousId, weekId);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), weekId);
  });

  test('keeps Month Nodes independent from the Year Week Day hierarchy', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    const february = time.goToMonth('2026-02');
    assert.ok(february);
    let index = buildTanaIndex(editor.children);
    assert.equal(index.parentNodeIds.get(february!), 'daily');
    assert.equal(index.nodesById.get(february!)?.time?.value, '2026-02');

    const march = time.nextDay();
    assert.ok(march);
    index = buildTanaIndex(editor.children);
    assert.equal(index.nodesById.get(march!)?.time?.value, '2026-03');
    assert.equal(time.previousDay(), february);
  });

  test('dispatches Date Object navigation by its value granularity', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    const month = time.goToDate('2026-02');
    const week = time.goToDate('2026-W09');
    const day = time.goToDate('2026-02-28T12:00:00Z');
    assert.ok(month && week && day);
    const index = buildTanaIndex(editor.children);
    assert.equal(index.nodesById.get(month)?.time?.unit, 'month');
    assert.equal(index.nodesById.get(week)?.time?.unit, 'week');
    assert.equal(index.nodesById.get(day)?.time?.value, '2026-02-28');
  });

  test('keeps generated Day Nodes in chronological sibling order', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;

    assert.ok(time.goToDay('2026-01-03'));
    assert.ok(time.goToDay('2026-01-01'));
    const index = buildTanaIndex(editor.children);
    const weekId = index.timeNodeIds.get('week:2026-W01');
    assert.deepEqual(
      (index.childrenByParent.get(weekId ?? '') ?? []).map((id) => index.nodesById.get(id)?.time?.value),
      ['2026-01-01', '2026-01-03'],
    );
  });

  test('retains Calendar identities after a persistence-shaped reload', () => {
    const editor = createEditor(workspace());
    const time = editor.getTransforms(TanaTimePlugin).time;
    const dayId = time.goToDay('2028-02-29');
    assert.ok(dayId);
    const saved = JSON.parse(JSON.stringify(editor.children)) as Value;

    assert.equal(isValidTanaDocument(saved), true);
    const reloaded = createEditor(saved);
    const index = buildTanaIndex(reloaded.children);
    assert.equal(index.timeNodeIds.get('day:2028-02-29'), dayId);
    assert.equal(reloaded.getTransforms(TanaTimePlugin).time.goToDay('2028-02-29'), dayId);
  });

  test('relocates an existing Calendar subtree under its Year while preserving relative indents', () => {
    const value = workspace();
    value.splice(4, 0,
      { children: [{ text: '2026' }], id: 'calendar-year', indent: 2, tanaTime: { unit: 'year', value: '2026' }, type: KEYS.p },
      { children: [{ text: '2026-W01' }], id: 'calendar-week', indent: 2, tanaTime: { unit: 'week', value: '2026-W01' }, type: KEYS.p },
      { children: [{ text: '2026-01-02' }], id: 'calendar-day', indent: 3, tanaTime: { unit: 'day', value: '2026-01-02' }, type: KEYS.p },
      { children: [{ text: 'body' }], id: 'calendar-body', indent: 4, type: KEYS.p },
    );
    const editor = createEditor(value);
    const time = editor.getTransforms(TanaTimePlugin).time;

    assert.equal(time.goToDay('2026-01-02'), 'calendar-day');
    const index = buildTanaIndex(editor.children);
    assert.equal(index.parentNodeIds.get('calendar-week'), 'calendar-year');
    assert.equal(index.parentNodeIds.get('calendar-day'), 'calendar-week');
    assert.equal(index.parentNodeIds.get('calendar-body'), 'calendar-day');

    const yearPath = editor.api.node({ at: [], id: 'calendar-year' })![1][0];
    const weekPath = editor.api.node({ at: [], id: 'calendar-week' })![1][0];
    const dayPath = editor.api.node({ at: [], id: 'calendar-day' })![1][0];
    const bodyPath = editor.api.node({ at: [], id: 'calendar-body' })![1][0];
    assert.equal(editor.children[yearPath]?.indent, 2);
    assert.equal(editor.children[weekPath]?.indent, 3);
    assert.equal(editor.children[dayPath]?.indent, 4);
    assert.equal(editor.children[bodyPath]?.indent, 5);
  });

  test('records Created/Edited/Done timestamps on canonical Nodes and writes Done through a Reference target', () => {
    const editor = createEditor(workspace());
    const identity = editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity;

    editor.tf.insertNodes(
      { children: [{ text: 'New' }], id: 'new-node', indent: 2, type: KEYS.p },
      { at: [3] },
    );
    editor.getApi(TogglePlugin).toggle.toggleIds(['workspace', 'home'], true);
    const created = editor.children.find((node) => node.id === 'new-node') as any;
    assert.equal(typeof created.tanaCreatedAt, 'string');

    editor.tf.select({ anchor: { path: [3, 0], offset: 0 }, focus: { path: [3, 0], offset: 0 } });
    editor.tf.insertText('x');
    assert.equal(typeof (editor.children[3] as any).tanaLastEditedAt, 'string');

    editor.tf.setNodes({ tanaReferenceTargetId: 'new-node' }, { at: [2] });
    assert.equal(identity.setDoneState('task', 'done'), true);
    assert.equal((editor.children[3] as any).tanaDoneState, 'done');
    assert.equal(typeof (editor.children[3] as any).tanaDoneAt, 'string');
    assert.equal((editor.children[2] as any).tanaDoneState, undefined);
  });
});
