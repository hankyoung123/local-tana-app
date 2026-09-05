import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloseGuard } from './close-guard';

test('close is prevented synchronously and waits for a successful flush', async () => {
  const events: string[] = [];
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  const guard = createCloseGuard({ flush: () => pending, close: async () => { events.push('close'); }, onError: () => events.push('error') });
  const closing = guard({ preventDefault: () => events.push('prevent') });
  await guard({ preventDefault: () => events.push('prevent') });
  assert.deepEqual(events, ['prevent', 'prevent']);
  resolve();
  await closing;
  assert.deepEqual(events, ['prevent', 'prevent', 'close']);
});

test('failed flush blocks close and allows a subsequent attempt', async () => {
  let failed = true;
  let closed = 0;
  let errors = 0;
  const guard = createCloseGuard({ flush: async () => { if (failed) throw new Error('disk'); }, close: async () => { closed++; }, onError: () => { errors++; } });
  await guard({ preventDefault() {} });
  assert.equal(closed, 0);
  assert.equal(errors, 1);
  failed = false;
  await guard({ preventDefault() {} });
  assert.equal(closed, 1);
});

test('edits arriving during flush are also saved before close', async () => {
  let version = 1;
  let writes = 0;
  const events: string[] = [];
  const guard = createCloseGuard({
    getVersion: () => version,
    flush: async () => { writes++; if (writes === 1) version++; events.push(`save${writes}`); },
    close: async () => { events.push('close'); },
    onError: () => assert.fail('unexpected failure'),
  });
  await guard({ preventDefault() {} });
  assert.deepEqual(events, ['save1', 'save2', 'close']);
});
