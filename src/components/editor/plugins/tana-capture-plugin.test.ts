import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { buildTanaIndex, isTanaNodeElement, type TanaBlockElement, type TanaCaptureDraft } from '@/lib/tana';
import { initialDocument } from '@/lib/tana/initial-document';
import { TanaCapturePlugin } from './tana-capture-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';

function createEditor(): ReturnType<typeof createPlateEditor> {
  const value: Value = [
    { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
    { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
    { children: [{ text: 'Daily Notes' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
    { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
    { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
    { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
    { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
  ];
  return createPlateEditor({ nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' }, plugins: EditorKit, value });
}

describe('Tana capture transform', () => {
  test('materializes Today once and commits a direct child without changing the focused page', () => {
    const editor = createEditor();
    const capture = editor.getTransforms(TanaCapturePlugin).capture;
    const before = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
    const first = capture.commit('from quick add', { zoom: false, select: false });
    const second = capture.commit('from clipper', { zoom: false, select: false });
    assert.ok(first);
    assert.ok(second);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), before);
    const index = buildTanaIndex(editor.children);
    const today = index.timeNodeIds.get(`day:${new Date().toISOString().slice(0, 10)}`);
    assert.ok(today);
    assert.equal(index.parentNodeIds.get(first), today);
    assert.equal(index.parentNodeIds.get(second), today);
    assert.equal(new Set(editor.children.map((node) => node.id)).size, editor.children.length);
  });

  test('round-trips rich content, Supertag membership, and Field values through one canonical commit', () => {
    const editor = createPlateEditor({
      nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
      plugins: EditorKit,
      value: structuredClone(initialDocument),
    });
    const draft: TanaCaptureDraft = {
      content: [
        { text: 'Rich capture', bold: true },
        { children: [{ text: 'Home' }], key: 'home', type: 'mention' },
      ],
      supertagIds: ['supertag-project'],
      fields: [{ fieldId: 'field-summary', value: { type: 'plain', value: 'from capture' } }],
    };
    const nodeId = editor.getTransforms(TanaCapturePlugin).capture.commit(draft, {
      zoom: false,
      select: false,
    });
    assert.ok(nodeId);
    const index = buildTanaIndex(editor.children);
    const node = index.nodesById.get(nodeId);
    assert.ok(node?.supertagIds.includes('supertag-project'));
    const canonical = editor.api.node<TanaBlockElement>({ at: [], id: nodeId })?.[0];
    assert.equal(canonical && 'children' in canonical && canonical.children[0]?.text, 'Rich capture');
    assert.equal(canonical && 'children' in canonical && canonical.children.some((child) => 'key' in child && child.key === 'home'), true);
    assert.equal(index.fieldValues.get(nodeId)?.get('field-summary')?.value, 'from capture');
    assert.equal(index.fieldNodesByParent.get(nodeId)?.some((field) => field.fieldId === 'field-summary'), true);
  });
});
