'use client';

import { HashIcon } from 'lucide-react';
import type { TElement } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import type {
  NodeId,
  TanaIndex,
  TanaNode,
  TanaNodeSemanticType,
} from '@/lib/tana';

import { OutlineNodeView } from './outline-node-view';
import { TanaView } from './tana-view';

export type TanaNodeBlockRendererProps = {
  element: TElement;
  index: TanaIndex;
};

export type TanaNodeWorkspaceRendererProps = {
  focusedNodeId: NodeId | null;
  index: TanaIndex;
  node?: TanaNode;
  selectedNodeId: NodeId | null;
};

export type TanaNodeRenderer = {
  Block?: React.ComponentType<TanaNodeBlockRendererProps>;
  Workspace: React.ComponentType<TanaNodeWorkspaceRendererProps>;
};

function OutlineRenderer({
  focusedNodeId,
  selectedNodeId,
}: TanaNodeWorkspaceRendererProps) {
  return (
    <OutlineNodeView
      focusedNodeId={focusedNodeId}
      selectedNodeId={selectedNodeId}
    />
  );
}

function ViewRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  return node ? (
    <TanaView index={index} view={node} />
  ) : (
    <OutlineRenderer index={index} {...props} />
  );
}

function SupertagRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  return node ? (
    <SupertagInstances definition={node} index={index} />
  ) : (
    <OutlineRenderer index={index} {...props} />
  );
}

/** Field occurrence labels are derived from their Field Definition Node. */
function FieldRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const fieldId = (element as TElement & { tanaFieldId?: unknown }).tanaFieldId;

  if (typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 max-w-[45%] truncate pt-0.5 text-[#527664] text-sm"
      contentEditable={false}
    >
      {field?.text || '未命名字段'}
    </span>
  );
}

/** Empty typed value Nodes remain ordinary editable Plate Nodes. */
function ValueRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const nodeId = typeof element.id === 'string' ? element.id : undefined;

  if (!nodeId) return null;

  const fieldNode = Array.from(index.fieldNodesById.values()).find(
    (candidate) => candidate.valueNodeId === nodeId
  );

  if (!fieldNode || fieldNode.value) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 pt-0.5 text-[#9aa19d] text-sm"
      contentEditable={false}
    >
      未设置
    </span>
  );
}

/**
 * The registry selects presentation only. It owns neither document mutation
 * nor editor interaction state; both remain in Plate and semantic plugins.
 */
export const NodeRendererRegistry: Partial<
  Record<TanaNodeSemanticType, TanaNodeRenderer>
> = {
  field: { Block: FieldRenderer, Workspace: OutlineRenderer },
  value: { Block: ValueRenderer, Workspace: OutlineRenderer },
  'supertag-definition': { Workspace: SupertagRenderer },
  view: { Workspace: ViewRenderer },
};

export function getNodeRenderer(semanticType: TanaNodeSemanticType): TanaNodeRenderer {
  return NodeRendererRegistry[semanticType] ?? { Workspace: OutlineRenderer };
}

function SupertagInstances({
  definition,
  index,
}: {
  definition: TanaNode;
  index: TanaIndex;
}) {
  const editor = useEditorRef();
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
        <p className="mb-3 text-muted-foreground text-xs">实例 {instanceIds.length}</p>
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
                  type="button"
                  onClick={() =>
                    editor.getTransforms(TanaZoomPlugin).zoom.to(instance.id)
                  }
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
