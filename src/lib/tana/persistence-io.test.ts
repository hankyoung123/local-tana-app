import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('SQLite loading fails closed without writes for invalid schema, JSON or invariants', () => {
  const result = spawnSync('bun', ['-e', `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    let rows = [];
    let malformedTable = false;
    const writes = [];
    mock.module('@tauri-apps/api/core', () => ({ isTauri: () => true }));
    mock.module('@tauri-apps/plugin-sql', () => ({ default: { load: async () => ({
      execute: async (sql, args) => { writes.push([sql, args]); return {}; },
      select: async (sql) => sql.startsWith('PRAGMA') ? (malformedTable ? [] : ['id','schema_version','value','updated_at'].map(name => ({name, type: name === 'schema_version' ? 'INTEGER' : 'TEXT', notnull: 1, pk: name === 'id' ? 1 : 0}))) : rows,
    }) } }));
    const { loadPlateDocument, CURRENT_SCHEMA_VERSION } = await import('./src/lib/tana/persistence');
    const { initialDocument } = await import('./src/lib/tana/initial-document');
    malformedTable = true;
    await assert.rejects(loadPlateDocument(initialDocument), /schema/);
    malformedTable = false;
    for (const row of [
      {schema_version: CURRENT_SCHEMA_VERSION - 1, value: JSON.stringify(initialDocument)},
      {schema_version: CURRENT_SCHEMA_VERSION + 1, value: JSON.stringify(initialDocument)},
      {schema_version: CURRENT_SCHEMA_VERSION, value: '{'},
      {schema_version: CURRENT_SCHEMA_VERSION, value: '[]'},
      {schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify([{type:'p',id:'n',children:[{text:'invalid'}]}])},
    ]) {
      rows = [row];
      await assert.rejects(loadPlateDocument(initialDocument));
    }
    assert.equal(writes.some(([sql]) => /INSERT|UPDATE|ALTER|DROP/.test(sql)), false);
    rows = [{schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify(initialDocument)}];
    assert.deepEqual(await loadPlateDocument(initialDocument), initialDocument);
    rows = [];
    assert.deepEqual(await loadPlateDocument(initialDocument), initialDocument);
    assert.equal(writes.filter(([sql]) => /INSERT INTO/.test(sql)).length, 1);
  `], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
