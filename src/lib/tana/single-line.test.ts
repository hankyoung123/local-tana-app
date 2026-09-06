import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, NodeApi, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from './constants';

globalThis.requestAnimationFrame ??= () => 0;
function fixture(text = 'Hello', offset = 2) {
  const editor = createPlateEditor({
    plugins: EditorKit,
    nodeId: { filter: isTanaNodeElement },
    value: [
      { id: 'workspace', type: KEYS.p, tanaSystemNode: 'workspace', children: [{ text: 'Workspace' }] },
      { id: 'original', type: KEYS.p, indent: 1, children: [{ text }] },
    ] as Value,
  });
  editor.getApi(TogglePlugin).toggle.toggleIds(['workspace', 'original'], true);
  editor.tf.select({ path: [1, 0], offset });
  return editor;
}
function titles(editor: ReturnType<typeof fixture>) {
  const titles = editor.children.slice(1).map(node => NodeApi.string(node));
  assert.ok(titles.every(title => !/[\r\n\u2028\u2029]/.test(title)));
  return titles;
}
for (const [label, text, offset, inserted, expected] of [
  ['one newline', 'Hello', 2, 'A\nB', ['HeA', 'Bllo']],
  ['multiple newlines', 'Hello', 2, 'A\nB\nC', ['HeA', 'B', 'Cllo']],
  ['start', 'Hello', 0, 'A\nB', ['A', 'BHello']],
  ['middle', 'Hello', 3, 'A\nB', ['HelA', 'Blo']],
  ['end', 'Hello', 5, 'A\nB', ['HelloA', 'B']],
  ['empty', '', 0, 'A\nB', ['A', 'B']],
  ['blank lines', '', 0, '\n\n', ['', '', '']],
  ['line separators', '', 0, 'A\r\nB\rC\u2028D\u2029E', ['A', 'B', 'C', 'D', 'E']],
] as const) {
  test(`single-line plain paste: ${label}`, () => {
    const editor = fixture(text, offset);
    const before = structuredClone(editor.children);
    editor.tf.insertTextData({ getData: () => inserted } as unknown as DataTransfer);
    assert.deepEqual(titles(editor), [...expected]);
    assert.equal(new Set(editor.children.map(n => n.id)).size, editor.children.length);
    editor.tf.undo();
    assert.deepEqual(editor.children, before);
    editor.tf.redo();
    assert.deepEqual(titles(editor), [...expected]);
  });
}
test('multiline insertText uses node boundaries', () => {
  const editor = fixture();
  editor.tf.insertText('A\nB');
  assert.deepEqual(titles(editor), ['HeA', 'Bllo']);
});
test('soft break inserts same-parent sibling after subtree', () => {
  const editor = fixture();
  editor.tf.insertNodes({ id: 'child', type: KEYS.p, indent: 2, children: [{ text: 'Child' }] }, { at: [2] });
  editor.tf.select({ path: [1, 0], offset: 2 });
  editor.tf.insertSoftBreak();
  assert.deepEqual(titles(editor), ['Hello', 'Child', '']);
  assert.equal(editor.children[3].indent, 1);
  assert.equal(editor.children[1].id, 'original');
});

test('rich fragment promotes soft breaks while preserving marks', () => {
  const editor = fixture('Hello', 2);
  const before = structuredClone(editor.children);
  editor.tf.insertFragment([{ type: KEYS.p, children: [{ text: 'A\nB', bold: true }] }]);
  assert.deepEqual(titles(editor), ['HeA', 'Bllo']);
  assert.ok(editor.children[1].children.some(n => n.text === 'A' && n.bold));
  assert.ok(editor.children[2].children.some(n => n.text === 'B' && n.bold));
  editor.tf.undo();
  assert.deepEqual(editor.children, before);
});
test('rich fragment keeps later leaves on the line after a break', () => {
  const editor = fixture('', 0);
  editor.tf.insertFragment([{ type: KEYS.p, children: [
    { text: 'A\nB', bold: true },
    { text: 'C', italic: true },
  ] }]);
  assert.deepEqual(titles(editor), ['A', 'BC']);
  assert.ok(editor.children[1].children.some(n => n.text === 'A' && n.bold));
  assert.ok(editor.children[2].children.some(n => n.text === 'B' && n.bold));
  assert.ok(editor.children[2].children.some(n => n.text === 'C' && n.italic));
});
test('raw operations cannot bypass the single-line boundary', () => {
  const editor = fixture();
  const before = structuredClone(editor.children);
  assert.throws(() => editor.tf.apply({ type: 'insert_text', path: [1, 0], offset: 2, text: 'A\nB' }), /soft line breaks/);
  assert.deepEqual(editor.children, before);
  assert.throws(() => editor.tf.insertNodes({ type: KEYS.p, children: [{ text: 'A\nB' }] }), /soft line breaks/);
  assert.deepEqual(editor.children, before);
});

test('multiline insertion cannot concatenate lines across a protected system boundary', () => {
  const editor = fixture();
  editor.tf.select({ path: [0, 0], offset: 0 });
  const before = structuredClone(editor.children);
  editor.tf.insertText('A\nB');
  assert.deepEqual(editor.children, before);
});

test('multiline insertText at explicit location advances through created nodes', () => {
  const editor = fixture();
  editor.tf.insertText('A\nB', { at: { path: [1, 0], offset: 3 } });
  assert.deepEqual(titles(editor), ['HelA', 'Blo']);
});
