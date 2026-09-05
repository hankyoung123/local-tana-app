'use client';

import type { NodeId } from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import { getNodeRenderer } from './node-renderer-registry';
import { TanaTrashView } from './tana-trash-view';
import { TanaDailyNotesView } from './tana-daily-notes-view';

export function TanaNodeViewHost({
  focusedNodeId,
  selectedNodeId,
}: {
  focusedNodeId: NodeId | null;
  selectedNodeId: NodeId | null;
}) {
  const index = useTanaIndex();
  const focusedNode = focusedNodeId
    ? index.nodesById.get(focusedNodeId)
    : undefined;

  if (focusedNode?.systemNode === 'trash') return <TanaTrashView index={index} node={focusedNode} />;

  if (focusedNode?.systemNode === 'daily-notes') {
    return <TanaDailyNotesView index={index} node={focusedNode} />;
  }

  const Renderer = getNodeRenderer(focusedNode?.semanticType ?? 'content').Workspace;

  return (
    <Renderer
      focusedNodeId={focusedNodeId}
      index={index}
      node={focusedNode}
      selectedNodeId={selectedNodeId}
    />
  );
}
