import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana/constants';

import { TanaSearchPlugin } from './tana-search-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('Tana search mutations', () => {
  test('owns a root AND query separately from View presentation', () => {
    const editor = createEditor([
      { children: [{ text: 'Open tasks' }], id: 'search', type: KEYS.p },
      {
        children: [{ text: 'Project' }],
        id: 'project',
        tanaSupertagDefinition: {},
        type: KEYS.p,
      },
    ]);
    const search = editor.getTransforms(TanaSearchPlugin).search;

    assert.equal(search.define('search'), true);
    assert.equal(
      search.addClause('search', { kind: 'has-supertag', supertagId: 'project' }),
      true
    );
    assert.deepEqual(editor.children[0].tanaSearchDefinition, {
      query: {
        children: [{ predicate: { kind: 'has-supertag', supertagId: 'project' }, type: 'predicate' }],
        type: 'and',
      },
    });
    assert.equal(editor.children[0].tanaViewDefinition, undefined);
  });
});
