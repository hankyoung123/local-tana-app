import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS } from 'platejs';

import { getNodeSemanticType, TANA_NODE_SEMANTIC_TYPES } from '@/lib/tana/node-semantic';

import { getNodeRenderer, NodeRendererRegistry } from './node-renderer-registry';

describe('Node renderer registry', () => {
  test('registers every semantic through one presentation entry point', () => {
    TANA_NODE_SEMANTIC_TYPES.forEach((semantic) => {
      assert.ok(NodeRendererRegistry[semantic]);
      assert.ok(getNodeRenderer(semantic).Workspace);
    });

    assert.ok(NodeRendererRegistry.field.Block);
    assert.ok(NodeRendererRegistry.reference.Block);
    assert.ok(NodeRendererRegistry.value.Block);
    assert.equal(NodeRendererRegistry['field-definition'].Block, undefined);
    assert.equal(NodeRendererRegistry['supertag-definition'].Block, undefined);
    assert.equal(NodeRendererRegistry.view.Block, undefined);
  });

  test('renders a Supertag Definition through its derived instance page', () => {
    assert.notEqual(
      NodeRendererRegistry['supertag-definition'].Workspace,
      NodeRendererRegistry.content.Workspace
    );
    assert.equal(NodeRendererRegistry.option.Block, undefined);
  });

  test('selects the View renderer for a composable Supertag View Node', () => {
    const node = {
      children: [{ text: 'Project view' }],
      tanaSupertagDefinition: {},
      tanaViewDefinition: { type: 'outline' },
      type: KEYS.p
    };

    assert.equal(getNodeSemanticType(node), 'view');
    assert.equal(
      getNodeRenderer(getNodeSemanticType(node)).Workspace,
      NodeRendererRegistry.view.Workspace
    );
  });
});

test('Reference expansion derives canonical subtree order and prunes hidden Fields', async () => {
  const { buildTanaIndex } = await import('@/lib/tana/index');
  const { getReferenceSubtreeRows } = await import('./node-renderer-registry');
  const document = [
    { id: 'target', type: 'p', children: [{ text: 'Target' }], tanaPresentation: { hiddenFieldNodeIds: ['field'] } },
    { id: 'child', type: 'p', indent: 1, children: [{ text: 'Child' }] },
    { id: 'grandchild', type: 'p', indent: 2, children: [{ text: 'Grandchild' }] },
    { id: 'field', type: 'p', indent: 1, tanaFieldId: 'definition', children: [{ text: '' }] },
    { id: 'value', type: 'p', indent: 2, tanaFieldValueType: 'plain' as const, children: [{ text: 'Hidden' }] },
    { id: 'ref', type: 'p', indent: 1, tanaReferenceTargetId: 'target', children: [{ text: '' }] },
  ];
  const before = structuredClone(document);
  assert.deepEqual(getReferenceSubtreeRows(buildTanaIndex(document), 'target'), [
    { id: 'child', depth: 1 }, { id: 'grandchild', depth: 2 }, { id: 'ref', depth: 1 },
  ]);
  assert.deepEqual(document, before);
});

test('Reference chains and cycles never produce recursive projected subtrees', async () => {
  const { buildTanaIndex, getTanaProjectionTarget } = await import('@/lib/tana/index');
  const { getReferenceSubtreeRows } = await import('./node-renderer-registry');
  const index = buildTanaIndex([
    { id: 'root', type: 'p', children: [{ text: 'Root' }] },
    { id: 'ref-a', type: 'p', indent: 1, tanaReferenceTargetId: 'ref-b', children: [{ text: '' }] },
    { id: 'ref-b', type: 'p', tanaReferenceTargetId: 'ref-a', children: [{ text: '' }] },
  ]);
  assert.deepEqual(getReferenceSubtreeRows(index, 'root'), [{ id: 'ref-a', depth: 1 }]);
  for (const id of ['ref-a', 'ref-b']) {
    assert.equal(getTanaProjectionTarget(index, id), undefined);
    assert.deepEqual(getReferenceSubtreeRows(index, id), []);
  }
});
