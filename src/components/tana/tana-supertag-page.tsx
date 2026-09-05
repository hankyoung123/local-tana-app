'use client';

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
import { TanaNodeBullet } from './tana-node-gutter';

/** Navigation items are direct canonical children, never a separately persisted dashboard. */
export function getTanaSupertagPageChildren(
  index: TanaIndex,
  supertag: TanaNode
): TanaNode[] {
  return (index.childrenByParent.get(supertag.id) ?? []).flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    if (!node || !isTanaNodeActive(index, node.id)) return [];

    const isContentChild = node.semanticTypes.some((semantic) =>
      ['content', 'reference', 'search', 'view'].includes(semantic)
    );
    const isStructuralChild = node.semanticTypes.some((semantic) =>
      ['field', 'field-definition', 'value', 'option'].includes(semantic)
    );

    return isContentChild && !isStructuralChild ? [node] : [];
  });
}

function getChildLabel(index: TanaIndex, node: TanaNode): string {
  const fieldNode = index.fieldNodesById.get(node.id);

  return fieldNode
    ? resolveTanaNodeTitle(index, fieldNode.fieldId) || '未命名字段'
    : resolveTanaNodeTitle(index, node.id) || '未命名节点';
}

/**
 * The default Supertag page is a derived Table of active instances. Its other
 * navigation items lead to direct canonical child Nodes, where existing plugins retain
 * Field/template editing ownership.
 */
export function TanaSupertagPage({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const instances = getActiveSupertagInstances(index, node.id);
  const children = getTanaSupertagPageChildren(index, node);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--tana-canvas)]">
      <header className="shrink-0 px-6 pt-6 sm:px-10">
        <h1 className="flex min-h-7 items-center gap-2 font-medium text-[19px] tracking-[-0.015em]">
          <span className="text-[var(--tana-accent)]">
            <TanaNodeBullet semanticType="supertag-definition" />
          </span>
          {node.text || '未命名超级标签'}
        </h1>
        <nav aria-label="超级标签内容" className="mt-2 flex gap-1 overflow-x-auto border-b border-[var(--tana-divider)] text-[13px]">
          <button
            aria-current="page"
            className="shrink-0 border-[var(--tana-accent)] border-b-2 px-2 pb-1.5 font-medium text-[var(--tana-accent)]"
            type="button"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
          >
            全部实例
            <span className="ml-1 text-[var(--tana-text-tertiary)] text-[11px]">{instances.length}</span>
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              className="shrink-0 px-2 pb-1.5 text-[var(--tana-text-tertiary)] hover:text-[var(--tana-text)]"
              type="button"
              onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(child.id)}
            >
              {getChildLabel(index, child)}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
        {instances.length === 0 ? (
          <p className="text-[var(--tana-text-tertiary)] text-xs">暂无超级标签实例。</p>
        ) : (
          <TanaTableView index={index} results={instances} view={node} />
        )}
      </div>
    </section>
  );
}
