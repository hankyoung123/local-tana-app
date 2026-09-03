import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { initialDocument } from './initial-document';
import { buildTanaIndex } from './index';
import { isValidTanaDocument } from './persistence';

describe('canonical Tana workspace document', () => {
  test('derives the system workspace hierarchy from explicit Node markers', () => {
    const index = buildTanaIndex(initialDocument);

    assert.equal(index.systemNodeIds.get('workspace'), 'workspace-root');
    assert.equal(index.systemNodeIds.get('home'), 'home');
    assert.equal(index.systemNodeIds.get('schema'), 'schema');
    assert.equal(index.systemNodeIds.get('library'), 'library');
    assert.equal(index.systemNodeIds.get('settings'), 'settings');
    assert.equal(index.systemNodeIds.get('trash'), 'trash');
    assert.equal(index.parentNodeIds.get('home'), 'workspace-root');
    assert.equal(index.parentNodeIds.get('supertag-project'), 'schema');
    assert.equal(index.parentNodeIds.get('field-summary'), 'schema');
    assert.deepEqual(index.childrenByParent.get('workspace-root'), [
      'home',
      'daily-notes',
      'schema',
      'library',
      'settings',
      'trash',
    ]);
  });

  test('keeps system hierarchy and Node-level Supertag membership through JSON persistence', () => {
    const loaded = JSON.parse(JSON.stringify(initialDocument));
    const index = buildTanaIndex(loaded);

    assert.equal(isValidTanaDocument(loaded), true);
    assert.deepEqual(index.nodesById.get('node-project-example')?.supertagIds, [
      'supertag-project',
    ]);
    assert.deepEqual(index.nodesBySupertag.get('supertag-project'), [
      'node-project-example',
    ]);
    assert.equal(index.parentNodeIds.get('node-project-example'), 'home');
  });
});
