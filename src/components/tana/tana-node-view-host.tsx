'use client';

import type { NodeId } from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import { getNodeRenderer } from './node-renderer-registry';

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
