import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { TanaNodeGutter } from './tana-node-gutter';

test('TanaNodeGutter exposes its derived floating Reference count', () => {
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
  assert.match(markup, />2</);
});
