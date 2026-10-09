'use client';

import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
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
    <section className="tana-view-surface flex min-w-0 flex-1 flex-col">
      <header className="tana-view-toolbar shrink-0">
        <h1 className="tana-view-header flex min-h-7 items-center gap-2">
          <span className="text-[var(--tana-accent)]">
            <TanaNodeBullet semanticType="supertag-definition" />
          </span>
          {node.text || '未命名超级标签'}
        </h1>
        <nav aria-label="超级标签内容" className="tana-view-toolbar-controls mt-3 flex gap-1 overflow-x-auto border-b border-[var(--tana-divider)] text-[13px]">
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
        <button
          className="mt-3 inline-flex min-h-8 items-center rounded-lg bg-[var(--tana-accent)] px-3 font-medium text-white text-xs shadow-sm hover:brightness-95"
          type="button"
          onClick={() => editor.getTransforms(TanaSupertagPlugin).supertag.createInstance(node.id)}
        >
          新建实例
        </button>
      </header>
      <div className="tana-view-content min-h-0 flex-1 overflow-y-auto">
        {instances.length === 0 ? (
          <div className="tana-empty-state text-xs">暂无超级标签实例。</div>
        ) : (
          <TanaTableView index={index} results={instances} view={node} />
        )}
      </div>
    </section>
  );
}
