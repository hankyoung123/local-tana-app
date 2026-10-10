import { ElementApi } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaSearchPlugin } from '@/components/editor/plugins/tana-search-plugin';
import { buildTanaIndex } from '@/lib/tana/index';
import { getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

/**
 * Creates one real canonical Node for a View. Views never receive a result
 * cache: ordinary views add direct children, Search creates a sibling source
 * Node, and a Supertag View delegates to the existing instance writer.
 */
export function createTanaViewNode(
  editor: PlateEditor,
  viewId: NodeId,
  title = '',
  options: { day?: string } = {},
): NodeId | undefined {
  const index = buildTanaIndex(editor.children);
  const view = index.nodesById.get(viewId);
  const entry = editor.api.node({ at: [], id: viewId });

  if (!view || !entry || !ElementApi.isElement(entry[0]) || !view.viewDefinition) return;

  if (view.supertagDefinition) {
    return editor.getTransforms(TanaSupertagPlugin).supertag.createInstance(viewId);
  }

  if (view.searchDefinition) {
    return editor.getTransforms(TanaSearchPlugin).search
      .createResult(viewId, options)?.nodeId;
  }

  const [, path] = entry;
  const node = entry[0] as TanaBlockElement;
  const indent = typeof node.indent === 'number' ? node.indent + 1 : 1;
  const descendants = getTanaNodeDescendantPaths(editor.children, path);
  const insertionPath = [(descendants.at(-1) ?? path)[0] + 1];
  let nodeId: NodeId | undefined;

  const insert = () => {
    editor.tf.insertNodes(
      editor.api.create.block({ children: [{ text: title }], indent }),
      { at: insertionPath }
    );
    const created = editor.api.node(insertionPath)?.[0] as TanaBlockElement | undefined;
    nodeId = typeof created?.id === 'string' ? created.id : undefined;
  };

  // Calendar Add composes this adapter with the Field writer. Reuse that
  // surrounding batch so the one user action remains one undo step.
  if (editor.api.isMerging()) insert();
  else editor.tf.withNewBatch(insert);

  return nodeId;
}
