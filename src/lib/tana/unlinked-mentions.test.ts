import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';

import { isTanaNodeElement } from './constants';
import { buildTanaIndex } from './index';
import { findTanaUnlinkedMentions } from './unlinked-mentions';

test('unlinked mention scan stays derived and Link replaces only the chosen current text match', () => {
  const value: Value = [
    { children: [{ text: 'Project' }], id: 'target', type: KEYS.p },
    { children: [{ text: 'Project plans' }], id: 'plain-source', type: KEYS.p },
    {
      children: [
        { text: 'Linked ' },
        { children: [{ text: '' }], key: 'target', type: KEYS.mention },
      ],
      id: 'linked-source',
      type: KEYS.p,
    },
    { children: [{ text: 'Stale Project' }], id: 'reference-source', tanaReferenceTargetId: 'target', type: KEYS.p },
  ];
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
  const candidates = findTanaUnlinkedMentions(buildTanaIndex(editor.children), 'target');

  assert.deepEqual(candidates.map(({ sourceNodeId, start, end }) => ({ sourceNodeId, start, end })), [
    { sourceNodeId: 'plain-source', start: 0, end: 7 },
  ]);
  const before = structuredClone(editor.children);
  assert.equal(
    editor.getTransforms(TanaReferencePlugin).reference.linkUnlinkedMention(candidates[0]!),
    true
  );
  const after = structuredClone(editor.children);
  const source = editor.children.find((node) => node.id === 'plain-source');

  assert.equal(source?.children.some((child) => child.type === KEYS.mention && child.key === 'target'), true);
  assert.deepEqual(findTanaUnlinkedMentions(buildTanaIndex(editor.children), 'target'), []);
  assert.deepEqual(buildTanaIndex(editor.children).backlinks.get('target')?.map(({ sourceNodeId }) => sourceNodeId), [
    'plain-source',
    'linked-source',
    'reference-source',
  ]);
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
  editor.tf.redo();
  assert.deepEqual(editor.children, after);
});
