'use client';

import { HashIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  getActiveSupertagInstances,
  isTanaNodeActive,
  resolveTanaNodeTitle,
  type TanaIndex,
  type TanaNode,
} from '@/lib/tana';

import { TanaTableView } from './tana-table-view';

/** Tabs are direct canonical children, never a separately persisted dashboard. */
export function getTanaSupertagPageChildren(
  index: TanaIndex,
  supertag: TanaNode
): TanaNode[] {
  return (index.childrenByParent.get(supertag.id) ?? []).flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    return node && isTanaNodeActive(index, node.id) ? [node] : [];
  });
}

function getTabLabel(index: TanaIndex, node: TanaNode): string {
  const fieldNode = index.fieldNodesById.get(node.id);

  return fieldNode
    ? resolveTanaNodeTitle(index, fieldNode.fieldId) || '未命名字段'
    : resolveTanaNodeTitle(index, node.id) || '未命名节点';
}

/**
 * The default Supertag page is a derived Table of active instances. Its other
 * tabs navigate to direct canonical child Nodes, where existing plugins retain
 * Field/template editing ownership.
 */
export function TanaSupertagPage({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const instances = getActiveSupertagInstances(index, node.id);
  const children = getTanaSupertagPageChildren(index, node);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="shrink-0 border-b px-6 py-5 sm:px-10">
        <p className="mb-1 text-muted-foreground text-xs">超级标签节点</p>
        <h1 className="flex items-center gap-1.5 font-semibold text-2xl">
          <HashIcon aria-hidden="true" className="size-5 text-[#4f725f]" />
          {node.text || '未命名超级标签'}
        </h1>
        <div aria-label="超级标签内容" className="mt-4 flex gap-1 overflow-x-auto border-b text-sm" role="tablist">
          <button
            aria-selected="true"
            className="shrink-0 border-[#4f725f] border-b-2 px-2 pb-2 font-medium text-[#2c604b]"
            role="tab"
            type="button"
          >
            全部实例
            <span className="ml-1.5 text-muted-foreground text-xs">{instances.length}</span>
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              aria-selected="false"
              className="shrink-0 px-2 pb-2 text-muted-foreground hover:text-foreground"
              role="tab"
              type="button"
              onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(child.id)}
            >
              {getTabLabel(index, child)}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {instances.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无超级标签实例。</p>
        ) : (
          <TanaTableView index={index} results={instances} view={node} />
        )}
      </div>
    </section>
  );
}
