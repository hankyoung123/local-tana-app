import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TanaNodeGutter } from './tana-node-gutter';

test('TanaNodeGutter exposes a clickable floating Reference count only for non-focused Nodes', () => {
  const markup = renderToStaticMarkup(
    <TanaNodeGutter
      hasChildren={false}
      isDraggable={false}
      nodeLabel="Project"
      onCollapse={() => {}}
      onZoom={() => {}}
      open={false}
      referenceCount={2}
      semanticType="content"
    />
  );

  assert.match(markup, /aria-label="2 个引用"/);
  assert.match(markup, /<button/);
  assert.match(markup, />2</);

  const focusedMarkup = renderToStaticMarkup(
    <TanaNodeGutter
      hasChildren={false}
      isDraggable={false}
      isFocusedNode
      nodeLabel="Project"
      onCollapse={() => {}}
      onZoom={() => {}}
      open={false}
      referenceCount={2}
      semanticType="content"
    />
  );

  assert.doesNotMatch(focusedMarkup, /2 个引用/);
});
