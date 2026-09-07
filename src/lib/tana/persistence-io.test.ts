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
    for (const lineBreak of ['\\n', '\\r', '\\r\\n', '\\u2028', '\\u2029']) {
      const invalid = structuredClone(initialDocument);
      invalid[2].children = [{text: 'before' + lineBreak + 'after'}];
      rows = [{schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify(invalid)}];
      await assert.rejects(loadPlateDocument(initialDocument), /invariants/);
    }
    const invalidReferenceParent = structuredClone(initialDocument);
    invalidReferenceParent.splice(2, 0,
      {children: [{text: 'Canonical target'}], id: 'persistence-reference-target', indent: 2, type: 'p'},
      {children: [{text: 'Reference occurrence'}], id: 'persistence-reference-occurrence', indent: 2, tanaReferenceTargetId: 'persistence-reference-target', type: 'p'},
      {children: [{text: 'Invalid canonical child'}], id: 'persistence-reference-child', indent: 3, type: 'p'},
    );
    rows = [{schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify(invalidReferenceParent)}];
    await assert.rejects(loadPlateDocument(initialDocument), /invariants/);
    const invalidSupertagMembership = structuredClone(initialDocument);
    invalidSupertagMembership.find(node => node.id === 'node-project-example').tanaSupertagIds = ['missing-supertag'];
    rows = [{schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify(invalidSupertagMembership)}];
    await assert.rejects(loadPlateDocument(initialDocument), /invariants/);
    assert.equal(writes.some(([sql]) => /INSERT|UPDATE|ALTER|DROP/.test(sql)), false);
    rows = [{schema_version: CURRENT_SCHEMA_VERSION, value: JSON.stringify(initialDocument)}];
    assert.deepEqual(await loadPlateDocument(initialDocument), initialDocument);
    rows = [];
    assert.deepEqual(await loadPlateDocument(initialDocument), initialDocument);
    assert.equal(writes.filter(([sql]) => /INSERT INTO/.test(sql)).length, 1);
  `], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
