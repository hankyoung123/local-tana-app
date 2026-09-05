// Test-only HTML from the production View components. No test route or app store.
import { renderToStaticMarkup } from 'react-dom/server';
import { createPlateEditor, Plate } from 'platejs/react';
import type { Value } from 'platejs';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaView } from '@/components/tana/tana-view';
import { buildTanaIndex, createAndQuery } from '@/lib/tana';

const type = process.argv[2];
if (type !== 'table' && type !== 'cards') throw new Error('Expected table or cards');
const value: Value = [
  { id: 'view', type: 'p', children: [{ text: 'Long view title '.repeat(40) }],
    tanaViewDefinition: { type },
    tanaSearchDefinition: { query: createAndQuery([{ kind: 'text-contains', text: 'candidate' }]) } },
  { id: 'candidate', type: 'p', children: [{ text: 'candidate ' + 'longtitle'.repeat(50) }] },
  ...Array.from({ length: 12 }, (_, i) => [
    { id: `occurrence-${i}`, type: 'p', indent: 1, tanaFieldId: `field-${i}`, children: [{ text: '' }] },
    { id: `value-${i}`, type: 'p', indent: 2, tanaFieldValueType: 'plain', children: [{ text: 'Field value '.repeat(10) }] },
  ]).flat(),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `field-${i}`, type: 'p', tanaFieldDefinition: { type: 'plain' }, children: [{ text: `Field ${i}` }],
  })),
];
const editor = createPlateEditor({ plugins: EditorKit, value });
const index = buildTanaIndex(editor.children);
console.log(renderToStaticMarkup(
  <Plate editor={editor}><TanaView index={index} view={index.nodesById.get('view')!} /></Plate>
));
