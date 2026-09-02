import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS } from 'platejs';

import {
  getNodeSemanticType,
  TANA_NODE_SEMANTIC_TYPES,
} from '@/lib/tana/node-semantic';

import { getNodeRenderer, NodeRendererRegistry } from './node-renderer-registry';

describe('Node renderer registry', () => {
  test('registers every semantic through one presentation entry point', () => {
    TANA_NODE_SEMANTIC_TYPES.forEach((semantic) => {
      assert.ok(NodeRendererRegistry[semantic]);
      assert.ok(getNodeRenderer(semantic).Workspace);
    });

    assert.ok(NodeRendererRegistry['field-definition'].Block);
    assert.ok(NodeRendererRegistry.option.Block);
    assert.ok(NodeRendererRegistry.field.Block);
    assert.ok(NodeRendererRegistry.value.Block);
  });

  test('selects the View renderer for a composable Supertag View Node', () => {
    const node = {
      children: [{ text: 'Project view' }],
      tanaSupertagDefinition: {},
      tanaViewDefinition: { clauses: [] },
      type: KEYS.p,
    };

    assert.equal(getNodeSemanticType(node), 'view');
    assert.equal(
      getNodeRenderer(getNodeSemanticType(node)).Workspace,
      NodeRendererRegistry.view.Workspace
    );
  });
});
