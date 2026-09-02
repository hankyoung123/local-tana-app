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

describe('Plate document persistence', () => {
  test('validates Plate structure and Tana node invariants', () => {
    assert.equal(isPlateDocument(value('A')), true);
    assert.equal(isValidTanaDocument(value('A')), true);
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
      isValidTanaDocument([
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
      ]),
      true
    );
    assert.equal(
      isValidTanaDocument([
        {
          children: [{ text: 'Visible field preference' }],
          id: 'presentation',
          tanaPresentation: { hiddenFieldNodeIds: ['status-occurrence'] },
          type: 'p',
        },
      ]),
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

  test('treats Field-as-Node as a breaking schema and rejects legacy value maps', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, 4);
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
