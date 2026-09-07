import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';
import { KEYS, type Value } from 'platejs';
import { createPlateEditor, Plate } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import { buildTanaIndex } from '@/lib/tana/index';

import { NodeProjection } from './node-projection';
import { TanaIndexProvider } from './tana-index-context';

test('block Reference projection renders the complete canonical rich title without an occurrence copy', () => {
  const value: Value = [
    {
      children: [
        { bold: true, text: 'Project' },
        { text: ' with ' },
        { children: [{ text: '' }], key: 'related', type: KEYS.mention },
        { text: ' and ' },
        { children: [{ text: '' }], key: 'tag', type: TANA_SUPERTAG_KEY },
        { text: ' — ' },
        { children: [{ italic: true, text: 'Docs' }], type: KEYS.link, url: 'https://example.test/docs' },
      ],
      id: 'target',
      type: KEYS.p,
    },
    { children: [{ text: 'Related' }], id: 'related', type: KEYS.p },
    { children: [{ text: 'Tag' }], id: 'tag', tanaSupertagDefinition: {}, type: KEYS.p },
    { children: [{ text: 'Stale occurrence title' }], id: 'reference', tanaReferenceTargetId: 'target', type: KEYS.p },
  ];
  const editor = createPlateEditor({ plugins: EditorKit, value });
  const html = renderToStaticMarkup(
    <Plate editor={editor}>
      <TanaIndexProvider>
        <NodeProjection index={buildTanaIndex(value)} targetNodeId="reference" variant="block-reference" />
      </TanaIndexProvider>
    </Plate>
  );

  assert.match(html, /<strong>Project<\/strong>/);
  assert.match(html, /@Related/);
  assert.match(html, /#Tag/);
  assert.match(html, /href="https:\/\/example\.test\/docs"/);
  assert.match(html, /<em>Docs<\/em>/);
  assert.doesNotMatch(html, /Stale occurrence title/);
  assert.equal(value[3].children[0].text, 'Stale occurrence title');
});
