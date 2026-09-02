import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { KEYS } from 'platejs';

import {
  getNodeSemanticType,
  TANA_NODE_SEMANTIC_TYPES,
} from '@/lib/tana/node-semantic';

import { getNodeRenderer, NodeRendererRegistry } from './node-renderer-registry';

describe('Node renderer registry', () => {
  test('uses one outline renderer by default and only special-cases Node presentations', () => {
    TANA_NODE_SEMANTIC_TYPES.forEach((semantic) => {
      assert.ok(getNodeRenderer(semantic).Workspace);
    });

    assert.equal(NodeRendererRegistry.content, undefined);
    assert.equal(NodeRendererRegistry['field-definition'], undefined);
    assert.equal(NodeRendererRegistry.option, undefined);
    assert.ok(NodeRendererRegistry.field?.Block);
    assert.ok(NodeRendererRegistry.value?.Block);
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
      NodeRendererRegistry.view?.Workspace
    );
  });
});
