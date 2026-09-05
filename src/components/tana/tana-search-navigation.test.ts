import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TogglePlugin } from '@platejs/toggle/react';
import { createPlateEditor } from 'platejs/react';
import { EditorKit } from '@/components/editor/editor-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { getTanaProjectionTarget, buildTanaIndex } from '@/lib/tana/index';
import { focusAfterTanaSearch, selectTanaSearchResult } from './tana-workspace';

function createEditor() {
  return createPlateEditor({ plugins: EditorKit, value: [
    { id: 'root', type: 'p', children: [{ text: 'Root' }] },
    { id: 'parent', type: 'p', indent: 1, children: [{ text: 'Parent' }] },
    { id: 'deep', type: 'p', indent: 2, children: [{ text: 'Deep' }] },
    { id: 'ref', type: 'p', tanaReferenceTargetId: 'deep', children: [{ text: 'Occurrence' }] },
    { id: 'broken', type: 'p', tanaReferenceTargetId: 'missing', children: [{ text: '' }] },
    { id: 'trash', type: 'p', tanaSystemNode: 'trash', children: [{ text: 'Trash' }] },
    { id: 'archived', type: 'p', indent: 1, children: [{ text: 'Archived' }] },
    { id: 'archived-ref', type: 'p', tanaReferenceTargetId: 'archived', children: [{ text: '' }] },
    { id: 'chain', type: 'p', tanaReferenceTargetId: 'ref', children: [{ text: '' }] },
  ] });
}

test('deep and Reference search selections reveal canonical ancestors, dismiss, clear, and focus after dismissal', () => {
  for (const resultId of ['deep', 'ref']) {
    const editor = createEditor();
    const before = structuredClone(editor.children);
    let query = 'Deep';
    let open = true;
    const navigation: unknown[] = [];
    editor.tf.navigation.navigate = (options) => { navigation.push(options); return true; };
    assert.equal(selectTanaSearchResult(editor, resultId, (value) => { query = value; }, (value) => { open = value; }), true);
    assert.equal(query, '');
    assert.equal(open, false);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), 'deep');
    assert.equal(editor.getOption(TogglePlugin, 'openIds')?.has('root'), true);
    assert.equal(editor.getOption(TogglePlugin, 'openIds')?.has('parent'), true);
    assert.equal(navigation.length, 0, 'do not focus while modal focus trap is mounted');
    assert.equal(focusAfterTanaSearch(editor), true);
    assert.deepEqual(navigation, [{
      flash: false, focus: true, scroll: true,
      select: { path: [2, 0], offset: 0 }, target: { path: [2], type: 'node' },
    }]);
    assert.deepEqual(editor.children, before);
  }
});

test('stale, broken and chained Reference results never navigate to an occurrence or rebind', () => {
  const editor = createEditor();
  for (const id of ['broken', 'chain', 'missing', 'archived-ref', 'archived']) {
    let query = 'query';
    let open = true;
    assert.equal(selectTanaSearchResult(editor, id, (value) => { query = value; }, (value) => { open = value; }), false);
    assert.equal(editor.getOption(TanaZoomPlugin, 'focusedNodeId'), null);
    assert.equal(query, '');
    assert.equal(open, false);
    assert.equal(getTanaProjectionTarget(buildTanaIndex(editor.children), id), undefined);
  }
});

test('live Reference result renders the canonical resolved title and semantic with occurrence identity', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Command, CommandList } = await import('@/components/ui/command');
  const { SearchResult } = await import('./tana-workspace');
  const { searchTanaNodes } = await import('@/lib/tana/index');
  const index = buildTanaIndex([
    { id: 'template', type: 'p', tanaSupertagDefinition: { titleExpression: 'Resolved ${name}' }, children: [{ text: 'Template' }] },
    { id: 'canonical', type: 'p', tanaSupertagDefinition: {}, tanaSupertagIds: ['template'], children: [{ text: 'Target' }] },
    { id: 'occurrence', type: 'p', tanaReferenceTargetId: 'canonical', children: [{ text: 'Stale occurrence title' }] },
  ]);
  const result = searchTanaNodes(index, 'Resolved Target').find(({ id }) => id === 'occurrence');
  assert.ok(result);
  const item = SearchResult({ index, node: result, onNavigate: (id) => {
    assert.equal(id, 'occurrence');
  } });
  assert.ok(item);
  assert.equal(item.props.value, 'occurrence');
  item.props.onSelect();
  const markup = renderToStaticMarkup(createElement(Command, { shouldFilter: false },
    createElement(CommandList, null, item)));
  assert.match(markup, /Resolved Target/);
  assert.match(markup, />#<\/span>/);
  assert.doesNotMatch(markup, /Stale occurrence title/);
  assert.equal(result.id, 'occurrence');
});
