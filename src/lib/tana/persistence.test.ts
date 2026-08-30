import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Value } from 'platejs';

import {
  createDocumentSaveController,
  CURRENT_SCHEMA_VERSION,
  isPlateDocument,
  isValidTanaDocument,
  migratePlateDocument,
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
        {
          children: [{ text: 'Unset field' }],
          id: 'unset-field',
          tanaFieldValues: { priority: null },
          type: 'p',
        },
      ]),
      true
    );
  });

  test('migrates copied reference names to key-only semantic nodes', () => {
    const migrated = migratePlateDocument(
      [
        {
          children: [
            { text: 'A ' },
            {
              children: [{ text: '' }],
              key: 'target',
              type: 'mention',
              value: 'Stale name',
            },
          ],
          id: 'source',
          type: 'p',
        },
      ],
      1
    );

    assert.equal(CURRENT_SCHEMA_VERSION, 3);
    assert.deepEqual(migrated[0].children[1], {
      children: [{ text: '' }],
      key: 'target',
      type: 'mention',
    });
  });

  test('migrates every legacy top-level block to a NodeId without changing its type', () => {
    const migrated = migratePlateDocument(
      [
        { children: [{ text: 'Heading' }], type: 'h1' },
        { children: [{ text: 'Quote' }], type: 'blockquote' },
        { children: [{ text: 'Existing' }], id: 'existing', type: 'p' },
      ],
      2
    );

    assert.equal(migrated[0].type, 'h1');
    assert.equal(migrated[1].type, 'blockquote');
    assert.equal(typeof migrated[0].id, 'string');
    assert.equal(typeof migrated[1].id, 'string');
    assert.equal(migrated[2].id, 'existing');
    assert.equal(isValidTanaDocument(migrated), true);
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
