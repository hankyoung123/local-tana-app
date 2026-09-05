import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPlateEditor, Plate, PlateContent } from 'platejs/react';
import { SupertagKit } from '@/components/editor/plugins/supertag-kit';
import { TanaIndexProvider } from '@/components/tana/tana-index-context';
import type { Value } from 'platejs';

test('Supertag tokens expose named navigation only for active Supertag definitions', () => {
  for (const target of ['valid', 'missing', 'ordinary', 'archived']) {
    const value: Value = [
      { id: 'host', type: 'p', children: [{ text: '' }, { type: 'tana_supertag', key: target, children: [{ text: '' }] }, { text: '' }] },
      { id: 'valid', type: 'p', tanaSupertagDefinition: {}, children: [{ text: 'Project' }] },
      { id: 'ordinary', type: 'p', children: [{ text: 'Ordinary' }] },
      { id: 'trash', type: 'p', tanaSystemNode: 'trash', children: [{ text: 'Trash' }] },
      { id: 'archived', type: 'p', indent: 1, tanaSupertagDefinition: {}, children: [{ text: 'Archived' }] },
    ];
    const editor = createPlateEditor({ plugins: SupertagKit, value });
    const html = renderToStaticMarkup(
      <Plate editor={editor}><TanaIndexProvider><PlateContent /></TanaIndexProvider></Plate>
    );
    if (target === 'valid') {
      assert.match(html, /role="link"/);
      assert.match(html, /aria-label="打开超级标签 Project"/);
      assert.match(html, /tabindex="0"/);
    } else {
      assert.doesNotMatch(html, /role="link"/);
      assert.doesNotMatch(html, /aria-label="打开超级标签/);
    }
  }
});
