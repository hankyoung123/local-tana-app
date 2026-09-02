import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS, type Value } from 'platejs';
import { createPlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { isTanaNodeElement } from '@/lib/tana';

import { TanaNodePlugin } from './tana-node-plugin';

function createEditor(value: Value) {
  return createPlateEditor({
    nodeId: { filter: isTanaNodeElement, initialValueIds: 'always' },
    plugins: EditorKit,
    value,
  });
}

describe('Tana Node Plugin', () => {
  test('resolves a Plate NodeId to derived semantic, renderer key, and behavior', () => {
    const editor = createEditor([
      { children: [{ text: 'Task' }], id: 'task', type: KEYS.p },
      {
        children: [{ text: 'Status' }],
        id: 'status',
        tanaFieldDefinition: { type: 'plain' },
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'task-status',
        indent: 1,
        tanaFieldId: 'status',
        type: KEYS.p,
      },
      {
        children: [{ text: '' }],
        id: 'task-status-value',
        indent: 2,
        tanaFieldValueType: 'plain',
        type: KEYS.p,
      },
    ]);

    const runtime = editor.getApi(TanaNodePlugin).tanaNode.resolve('task-status');

    assert.equal(runtime?.id, 'task-status');
    assert.equal(runtime?.semanticType, 'field');
    assert.equal(runtime?.renderer, 'field');
    assert.equal(runtime?.behavior.canDrag, true);
    assert.deepEqual(runtime?.semanticTypes, ['field']);
  });

  test('preserves composable semantics while resolving the primary renderer', () => {
    const editor = createEditor([
      {
        children: [{ text: 'Project view' }],
        id: 'project-view',
        tanaSupertagDefinition: {},
        tanaViewDefinition: { clauses: [] },
        type: KEYS.p,
      },
    ]);

    const runtime = editor
      .getApi(TanaNodePlugin)
      .tanaNode.resolve('project-view');

    assert.equal(runtime?.renderer, 'view');
    assert.equal(runtime?.semanticType, 'view');
    assert.deepEqual(runtime?.semanticTypes, [
      'supertag-definition',
      'view',
    ]);
  });
});
