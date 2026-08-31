'use client';

import { HashIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import type { NodeId, TanaNode } from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import { OutlineNodeView } from './outline-node-view';
import { TanaView } from './tana-view';

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

  if (focusedNode?.viewDefinition) {
    return <TanaView index={index} view={focusedNode} />;
  }

  if (focusedNode?.supertagDefinition) {
    return <SupertagInstances definition={focusedNode} />;
  }

  return (
    <OutlineNodeView
      focusedNodeId={focusedNodeId}
      selectedNodeId={selectedNodeId}
    />
  );
}

function SupertagInstances({ definition }: { definition: TanaNode }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const instanceIds = index.nodesBySupertag.get(definition.id) ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[#e7ebe8] px-6 py-5 sm:px-[max(48px,calc(50%-390px))]">
        <p className="mb-1 flex items-center gap-1.5 text-[#1f6f52] text-xs">
          <HashIcon className="size-3.5" />
          超级标签
        </p>
        <h1 className="font-semibold text-2xl text-[#202421] tracking-normal">
          # {definition.text || '未命名超级标签'}
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-[max(48px,calc(50%-390px))]">
        <p className="mb-3 text-muted-foreground text-xs">
          实例 {instanceIds.length}
        </p>
        {instanceIds.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无实例。</p>
        ) : (
          <div className="space-y-1">
            {instanceIds.map((instanceId) => {
              const instance = index.nodesById.get(instanceId);

              if (!instance) return null;

              return (
                <button
                  key={instance.id}
                  className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[#f2f6f3]"
                  onClick={() =>
                    editor.getTransforms(TanaZoomPlugin).zoom.to(instance.id)
                  }
                  type="button"
                >
                  {instance.text || '未命名节点'}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
