import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import {
  createDocumentSaveController,
  CURRENT_SCHEMA_VERSION,
  isPlateDocument,
  isValidTanaDocument,
} from './persistence';

const value = (text: string): Value => [
  { children: [{ text }], id: 'node', type: 'p' },
];

const minimalWorkspace = (): Value => [
  { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
  { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
  { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
  { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
  { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
  { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
  { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
];

const withWorkspace = (extra: Value): Value => [
  ...minimalWorkspace(),
  ...extra.map((node) => ({
    ...node,
    indent: typeof node.indent === 'number' ? node.indent + 1 : 1,
  })),
];

describe('Plate document persistence', () => {
  test('validates Plate structure and Tana node invariants', () => {
    assert.equal(isPlateDocument(value('A')), true);
    // A bare Node is valid Plate but not a valid Tana workspace document.
    assert.equal(isValidTanaDocument(value('A')), false);
    assert.equal(isValidTanaDocument(minimalWorkspace()), true);
    assert.equal(isPlateDocument([]), false);
    assert.equal(isPlateDocument([{ children: 'nope', type: 'p' }]), false);
    assert.equal(
      isValidTanaDocument([{ children: [{ text: 'Missing ID' }], type: 'p' }]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'A' }], id: 'same', type: 'p' },
        { children: [{ text: 'B' }], id: 'same', type: 'toggle' },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Tags' }],
            id: 'tags',
            tanaFieldDefinition: { cardinality: 'list', type: 'plain' },
            type: 'p',
          },
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'task-tags',
            indent: 1,
            tanaFieldId: 'tags',
            type: 'p',
          },
          {
            children: [{ text: 'First' }],
            id: 'task-tags-first',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
          {
            children: [{ text: 'Second' }],
            id: 'task-tags-second',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'historical-field',
            indent: 1,
            tanaFieldId: 'deleted-definition',
            type: 'p',
          },
          {
            children: [{ text: 'Historical value' }],
            id: 'historical-value',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Orphan' }],
          id: 'orphan-value',
          tanaFieldValueType: 'plain',
          type: 'p',
        },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          { children: [{ text: 'Priority' }], id: 'priority', tanaFieldDefinition: { type: 'plain' }, type: 'p' },
          { children: [{ text: 'Task' }], id: 'task', type: 'p' },
          {
            children: [{ text: '' }],
            id: 'field-occurrence',
            indent: 1,
            tanaFieldId: 'priority',
            type: 'p',
          },
          {
            children: [{ text: '' }],
            id: 'field-value',
            indent: 2,
            tanaFieldValueType: 'plain',
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument(
        withWorkspace([
          {
            children: [{ text: 'Visible field preference' }],
            id: 'presentation',
            tanaPresentation: { hiddenFieldNodeIds: ['status-occurrence'] },
            type: 'p',
          },
        ])
      ),
      true
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Duplicate field preference' }],
          id: 'invalid-presentation',
          tanaPresentation: {
            hiddenFieldNodeIds: ['status-occurrence', 'status-occurrence'],
          },
          type: 'p',
        },
      ]),
      false
    );
  });

  test('treats obsolete Field metadata as a breaking schema', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, 6);
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Task' }],
          id: 'task',
          tanaFieldValues: { priority: { type: 'plain', value: 'legacy' } },
          type: 'p',
        },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Status' }],
          id: 'status',
          tanaFieldDefinition: { options: ['active'], type: 'options' },
          type: 'p',
        },
      ]),
      false
    );
  });

  test('keeps View presentation settings in the persisted Plate Document', () => {
    const document = withWorkspace([
      {
        children: [{ text: 'Tasks' }],
        id: 'tasks-view',
        tanaViewDefinition: {
          calendarDateFieldId: 'due-date',
          groupFieldId: 'status',
          sort: { direction: 'asc', fieldId: '$title' },
          type: 'table',
          visibleFieldIds: ['status', 'owner'],
        },
        type: 'p',
      },
    ]);

    const reloaded = JSON.parse(JSON.stringify(document)) as Value;

    assert.equal(isValidTanaDocument(document), true);
    assert.equal(isValidTanaDocument(reloaded), true);
    assert.deepEqual(reloaded.at(-1)?.tanaViewDefinition, {
      calendarDateFieldId: 'due-date',
      groupFieldId: 'status',
      sort: { direction: 'asc', fieldId: '$title' },
      type: 'table',
      visibleFieldIds: ['status', 'owner'],
    });
  });

  test('accepts explicit system Nodes and rejects invalid membership metadata', () => {
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
        { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
        { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
        { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
        { children: [{ text: 'Project' }], id: 'project', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
        { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
        { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
        { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
        { children: [{ text: 'Task' }], id: 'task', indent: 1, tanaSupertagIds: ['project'], type: 'p' },
      ]),
      true
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Task' }], id: 'task', tanaSupertagIds: ['project', 'project'], type: 'p' },
      ]),
      false
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Workspace' }], id: 'ws', tanaSystemNode: 'workspace', type: 'p' },
        { children: [{ text: 'Home' }], id: 'ws-home', indent: 1, tanaSystemNode: 'home', type: 'p' },
        { children: [{ text: 'Daily' }], id: 'ws-daily', indent: 1, tanaSystemNode: 'daily-notes', type: 'p' },
        { children: [{ text: 'Schema' }], id: 'ws-schema', indent: 1, tanaSystemNode: 'schema', type: 'p' },
        { children: [{ text: 'Base' }], id: 'base', indent: 2, tanaSupertagDefinition: {}, type: 'p' },
        { children: [{ text: 'Task' }], id: 'task-tag', indent: 2, tanaSupertagDefinition: { extends: ['base'] }, type: 'p' },
        { children: [{ text: 'Library' }], id: 'ws-library', indent: 1, tanaSystemNode: 'library', type: 'p' },
        { children: [{ text: 'Settings' }], id: 'ws-settings', indent: 1, tanaSystemNode: 'settings', type: 'p' },
        { children: [{ text: 'Trash' }], id: 'ws-trash', indent: 1, tanaSystemNode: 'trash', type: 'p' },
      ]),
      true
    );
    assert.equal(
      isValidTanaDocument([
        { children: [{ text: 'Task' }], id: 'task', tanaSystemNode: 'not-a-system-node', type: 'p' },
      ]),
      false
    );
  });

  test('accepts one valid Day Node and rejects duplicate or invalid time identity', () => {
    const document = minimalWorkspace();

    document.splice(3, 0, {
      children: [{ text: 'Day' }],
      id: 'day',
      indent: 2,
      tanaTime: { unit: 'day', value: '2026-03-01' },
      type: 'p',
    });
    assert.equal(isValidTanaDocument(document), true);

    const duplicate = structuredClone(document);
    duplicate.splice(4, 0, {
      children: [{ text: 'Same day' }],
      id: 'same-day',
      indent: 2,
      tanaTime: { unit: 'day', value: '2026-03-01' },
      type: 'p',
    });
    assert.equal(isValidTanaDocument(duplicate), false);

    const invalidDay = structuredClone(document);
    invalidDay[3] = {
      ...invalidDay[3],
      tanaTime: { unit: 'day', value: '2026-02-29' },
    };
    assert.equal(isValidTanaDocument(invalidDay), false);
  });

  test('flushes a debounced final edit before close', async () => {
    const writes: Value[] = [];
    const controller = createDocumentSaveController({
      delay: 10_000,
      write: async (document) => {
        writes.push(structuredClone(document));
      },
    });

    controller.schedule(value('Last edit'));
    await controller.flush();

    assert.deepEqual(writes, [value('Last edit')]);
  });

  test('serializes writes and reloads the latest saved snapshot', async () => {
    const writes: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const controller = createDocumentSaveController({
      delay: 0,
      write: async (document) => {
        const text = (document[0].children[0] as { text: string }).text;

        if (text === 'First') await firstWriteBlocked;
        writes.push(text);
      },
    });

    controller.schedule(value('First'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.schedule(value('Second'));
    const flushPromise = controller.flush();

    assert.deepEqual(writes, []);
    releaseFirstWrite?.();
    await flushPromise;

    assert.deepEqual(writes, ['First', 'Second']);
    assert.deepEqual(value(writes.at(-1)!), value('Second'));
  });
});
