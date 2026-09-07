import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TogglePlugin } from '@platejs/toggle/react';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor, Plate, PlateContent } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { MentionKit } from '@/components/editor/plugins/mention-kit';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaIndexProvider } from '@/components/tana/tana-index-context';
import { isTanaNodeElement } from '@/lib/tana/constants';
import { insertTanaInlineReference } from './mention-node';
import {
  buildTanaIndex,
  getTanaReferenceTargetResolution,
} from '@/lib/tana/index';

function mentionValue(
  targetNodeId: string,
  target: Value[number] | undefined,
  alias?: string
): Value {
  return [
    {
      children: [
        { text: 'See ' },
        {
          children: [{ text: '' }],
          key: targetNodeId,
          type: KEYS.mention,
          value: alias,
        },
      ],
      id: 'host',
      type: KEYS.p,
    },
    ...(target ? [target] : []),
  ];
}

function renderMention(value: Value): string {
  const editor = createPlateEditor({ plugins: MentionKit, value });

  return renderToStaticMarkup(
    <Plate editor={editor}>
      <TanaIndexProvider>
        <PlateContent />
      </TanaIndexProvider>
    </Plate>
  );
}

test('Inline Mention exposes link semantics only for a direct live canonical target', () => {
  const live = renderMention(mentionValue('target', {
    children: [{ text: 'Project' }], id: 'target', type: KEYS.p,
  }));
  assert.match(live, /data-reference-status="live"/);
  assert.match(live, /role="link"/);
  assert.match(live, /aria-label="打开引用 Project"/);

  const unavailable = renderMention([
    ...mentionValue('target', undefined),
    { children: [{ text: 'Trash' }], id: 'trash', tanaSystemNode: 'trash', type: KEYS.p },
    { children: [{ text: 'Project' }], id: 'target', indent: 1, type: KEYS.p },
  ]);
  assert.match(unavailable, /data-reference-status="trashed-or-unavailable"/);
  assert.match(unavailable, /引用：目标不可用/);
  assert.doesNotMatch(unavailable, /role="link"/);

  const chained = renderMention([
    ...mentionValue('occurrence', undefined),
    { children: [{ text: 'Project' }], id: 'target', type: KEYS.p },
    { children: [{ text: '' }], id: 'occurrence', tanaReferenceTargetId: 'target', type: KEYS.p },
  ]);
  assert.match(chained, /data-reference-status="trashed-or-unavailable"/);
  assert.doesNotMatch(chained, /role="link"/);

  const missing = renderMention(mentionValue('missing', undefined));
  assert.match(missing, /data-reference-status="missing"/);
  assert.match(missing, /引用：目标已删除/);
  assert.doesNotMatch(missing, /role="link"/);
});

test('selected text plus @ becomes an Inline Reference alias without changing the canonical target', () => {
  const editor = createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Project' }], id: 'target', type: KEYS.p },
      { children: [{ text: 'Sprint' }], id: 'host', type: KEYS.p },
    ] as Value,
  });

  editor.tf.select({
    anchor: { path: [1, 0], offset: 0 },
    focus: { path: [1, 0], offset: 6 },
  });
  editor.tf.insertText('@');
  assert.equal(editor.meta.tanaReferencePendingAlias, 'Sprint');
  assert.equal(insertTanaInlineReference(editor, 'target', ''), true);

  const mention = editor.children
    .find((node) => node.id === 'host')
    ?.children.find((child) => child.type === KEYS.mention);
  assert.equal(mention?.key, 'target');
  assert.equal(mention?.value, 'Sprint');
  assert.equal(editor.meta.tanaReferencePendingAlias, undefined);
  assert.equal(editor.children.find((node) => node.id === 'target')?.children[0]?.text, 'Project');

  const markup = renderMention(mentionValue('target', {
    children: [{ text: 'Project' }], id: 'target', type: KEYS.p,
  }, 'Sprint'));
  assert.match(markup, /aria-label="打开引用 Sprint（Project）"/);
  assert.match(markup, />Sprint</);
});

test('Inline Mention follows target Trash, restore, permanent delete, and replacement lifecycle without rebinding', () => {
  const editor = createPlateEditor({
    plugins: EditorKit,
    value: [
      { children: [{ text: 'Workspace' }], id: 'workspace', tanaSystemNode: 'workspace', type: KEYS.p },
      { children: [{ text: 'Home' }], id: 'home', indent: 1, tanaSystemNode: 'home', type: KEYS.p },
      { children: [{ text: 'Project' }], id: 'target', indent: 2, type: KEYS.p },
      {
        children: [
          { text: 'See ' },
          { children: [{ text: '' }], key: 'target', type: KEYS.mention },
        ],
        id: 'host',
        indent: 2,
        type: KEYS.p,
      },
      { children: [{ text: 'Daily' }], id: 'daily', indent: 1, tanaSystemNode: 'daily-notes', type: KEYS.p },
      { children: [{ text: 'Schema' }], id: 'schema', indent: 1, tanaSystemNode: 'schema', type: KEYS.p },
      { children: [{ text: 'Library' }], id: 'library', indent: 1, tanaSystemNode: 'library', type: KEYS.p },
      { children: [{ text: 'Settings' }], id: 'settings', indent: 1, tanaSystemNode: 'settings', type: KEYS.p },
      { children: [{ text: 'Trash' }], id: 'trash', indent: 1, tanaSystemNode: 'trash', type: KEYS.p },
    ] as Value,
  });
  const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;
  const status = () => getTanaReferenceTargetResolution(buildTanaIndex(editor.children), 'target').status;
  const mentionKey = () => editor.children.find((node) => node.id === 'host')?.children[1]?.key;
  editor.getApi(TogglePlugin).toggle.toggleIds(
    editor.children.map((node) => String(node.id)),
    true
  );

  assert.equal(status(), 'live');
  assert.equal(lifecycle.trash('target'), true);
  assert.equal(status(), 'trashed-or-unavailable');
  assert.equal(mentionKey(), 'target');
  assert.equal(lifecycle.restore('target'), true);
  assert.equal(status(), 'live');
  assert.equal(lifecycle.trash('target'), true);
  assert.equal(lifecycle.deletePermanently('target'), true);
  assert.equal(status(), 'missing');
  assert.equal(mentionKey(), 'target');

  editor.tf.insertNodes({ children: [{ text: 'Project' }], id: 'replacement', indent: 2, type: KEYS.p }, { at: [2] });
  assert.equal(status(), 'missing');
  assert.equal(mentionKey(), 'target');
});
