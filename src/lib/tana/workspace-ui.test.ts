import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  clampTanaSidebarWidth,
  DEFAULT_TANA_SIDEBAR_TOP_ITEMS,
  normalizeTanaSidebarTopItems,
  normalizeTanaWorkspaceUi,
} from './workspace-ui';

describe('workspace UI metadata', () => {
  test('keeps legacy workspaces at the default sidebar configuration', () => {
    assert.equal(normalizeTanaWorkspaceUi(undefined).sidebar?.mode, 'full');
    assert.deepEqual(normalizeTanaWorkspaceUi(undefined).sidebar?.topItems, DEFAULT_TANA_SIDEBAR_TOP_ITEMS);
  });

  test('preserves hidden order and removes duplicate pins without caching content', () => {
    const ui = normalizeTanaWorkspaceUi({
      sidebar: { mode: 'mini', topItems: ['search', 'today', 'search'], pinnedNodeIds: ['node-a', 'node-a', 'missing'] },
      quickAddDraft: 'draft',
    });
    assert.equal(ui.sidebar?.mode, 'mini');
    assert.deepEqual(ui.sidebar?.topItems, ['search', 'today']);
    assert.deepEqual(ui.sidebar?.pinnedNodeIds, ['node-a', 'missing']);
    assert.deepEqual(ui.quickAddDraft, { content: [{ text: 'draft' }] });
    assert.equal('children' in ui, false);
  });

  test('clamps resize values to the supported range', () => {
    assert.equal(clampTanaSidebarWidth(20), 176);
    assert.equal(clampTanaSidebarWidth(999), 420);
    assert.deepEqual(normalizeTanaSidebarTopItems([]), []);
  });
});
