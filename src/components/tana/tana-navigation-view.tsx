'use client';

import * as React from 'react';
import { ArrowUpRightIcon, PlusIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { resolveTanaNodeTitle, type TanaIndex, type TanaNode, type TanaViewProjection } from '@/lib/tana';
import { NodeProjection } from './node-projection';
import { createTanaViewNode } from './tana-view-actions';

/**
 * List, Tabs, and Side menu share one interaction model: the collection owns
 * the active item, while the right hand pane is a live projection of that
 * item's canonical Node. Clicking a label never changes zoom context; the
 * explicit open action does.
 */
export function TanaNavigationView({
  index,
  projection,
  type,
  view,
}: {
  index: TanaIndex;
  projection: TanaViewProjection;
  type: 'list' | 'side-menu' | 'tabs';
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const [selectedId, setSelectedId] = React.useState<string | undefined>(projection.items[0]?.occurrence.id);

  const selected = projection.items.find(({ occurrence }) => occurrence.id === selectedId)
    ?? projection.items[0];
  const create = () => {
    const nodeId = createTanaViewNode(editor, view.id);
    if (!nodeId) return;
    setSelectedId(nodeId);
    editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
  };
  const open = () => {
    if (selected?.target.id) editor.getTransforms(TanaZoomPlugin).zoom.to(selected.target.id);
  };

  const navigation = (
    <nav
      aria-label={type === 'tabs' ? '视图标签' : '视图导航'}
      className={type === 'tabs'
        ? 'flex min-w-0 flex-1 items-center gap-1 overflow-x-auto border-b border-[var(--tana-divider)] pb-1'
        : 'tana-view-card flex min-w-44 flex-col gap-1 p-2'}
    >
      {projection.items.map(({ occurrence, target }) => {
        const title = resolveTanaNodeTitle(index, target.id) || '未命名节点';
        const active = occurrence.id === selected?.occurrence.id;
        return (
          <button
            aria-current={active ? 'page' : undefined}
            aria-label={`选择 ${title}`}
            className={type === 'tabs'
              ? `shrink-0 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${active ? 'bg-[var(--tana-selected)] text-[var(--tana-text)]' : 'text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)]'}`
              : `flex min-h-8 w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${active ? 'bg-[var(--tana-selected)] text-[var(--tana-text)]' : 'text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)]'}`}
            key={occurrence.id}
            type="button"
            onClick={() => setSelectedId(occurrence.id)}
          >
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </button>
        );
      })}
      <button
        aria-label="新建视图条目"
        className={type === 'tabs'
          ? 'grid size-8 shrink-0 place-items-center rounded-md text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]'
          : 'mt-1 flex min-h-8 items-center gap-2 rounded-md px-2.5 text-left text-xs text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]'}
        type="button"
        onClick={create}
      >
        <PlusIcon className="size-3.5" />
        {type !== 'tabs' && '新建条目'}
      </button>
    </nav>
  );

  const content = selected ? (
    <article className="tana-view-card min-w-0 flex-1 overflow-auto p-4" aria-label="选中条目内容">
      <header className="mb-4 flex items-start gap-3 border-b border-[var(--tana-divider)] pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium text-[var(--tana-text)]">
            {resolveTanaNodeTitle(index, selected.target.id) || '未命名节点'}
          </h2>
          <p className="mt-1 text-[11px] text-[var(--tana-text-tertiary)]">来自当前视图的实时节点投影</p>
        </div>
        <button
          aria-label="打开节点"
          className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
          type="button"
          onClick={open}
        >
          <ArrowUpRightIcon className="size-3.5" />
        </button>
      </header>
      <NodeProjection
        fieldIds={projection.visibleFieldIds}
        index={index}
        targetNodeId={selected.target.id}
        variant="search-result"
      />
      <div className="mt-4 space-y-1 border-t border-[var(--tana-divider)] pt-3">
        {(index.childrenByParent.get(selected.target.id) ?? [])
          .map((childId) => index.nodesById.get(childId))
          .filter((child): child is TanaNode => child !== undefined && !child.semanticTypes.includes('field') && !child.semanticTypes.includes('value'))
          .slice(0, 12)
          .map((child) => (
            <NodeProjection
              index={index}
              key={child.id}
              targetNodeId={child.id}
              variant="search-result"
            />
          ))}
      </div>
    </article>
  ) : (
    <div className="tana-empty-state tana-view-card flex-1">暂无匹配节点</div>
  );

  return type === 'tabs' ? (
    <section className="flex min-h-0 flex-col gap-3" aria-label="标签页视图">
      {navigation}
      {content}
    </section>
  ) : (
    <section className="flex min-h-0 flex-1 gap-3" aria-label={type === 'list' ? '列表视图' : '侧边菜单视图'}>
      {navigation}
      {content}
    </section>
  );
}
