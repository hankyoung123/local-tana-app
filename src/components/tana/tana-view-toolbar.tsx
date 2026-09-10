'use client';

import type { ReactNode } from 'react';

import { LayoutPanelTopIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveTanaNodeTitle, type TanaIndex, type TanaNode, type TanaViewDefinition } from '@/lib/tana';

import { TanaNodeBullet } from './tana-node-gutter';
import { TanaViewFilterControls } from './tana-view-filter-controls';

const viewTypeLabels: Record<TanaViewDefinition['type'], string> = {
  calendar: '日历',
  cards: '卡片',
  list: '列表',
  outline: '大纲',
  'side-menu': '侧边菜单',
  table: '表格',
  tabs: '标签页',
};

/**
 * Shared, document-backed chrome for every View. Individual renderers add
 * only controls that are meaningful for their presentation (columns, date
 * field, and so on); this component owns neither result data nor local state.
 */
export function TanaViewToolbar({
  controls,
  index,
  results,
  view,
}: {
  controls?: ReactNode;
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const type = view.viewDefinition?.type ?? 'outline';
  const visible = view.viewDefinition?.toolbarVisible !== false;

  if (!visible) {
    return (
      <header className="shrink-0 px-6 pt-3 sm:px-10">
        <button
          className="rounded px-2 py-1 text-xs text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
          type="button"
          onClick={() => editor.getTransforms(TanaViewPlugin).view.update(view.id, { toolbarVisible: true })}
        >
          显示工具栏
        </button>
      </header>
    );
  }

  return (
    <header className="min-w-0 max-w-full shrink-0 px-6 pt-8 sm:px-10">
      <div className="min-w-0">
        <h1 className="flex min-h-7 items-center gap-2 truncate font-medium text-[19px] tracking-[-0.015em]">
          <span className="text-[var(--tana-node-bullet)]">
            <TanaNodeBullet semanticType="view" />
          </span>
          <span className="truncate">{resolveTanaNodeTitle(index, view.id)}</span>
        </h1>
      </div>

      <div className="mt-3 flex min-w-0 max-w-full flex-wrap items-center gap-1 border-b border-[var(--tana-divider)] pb-2">
        <Select
          value={type}
          onValueChange={(nextType) =>
            editor
              .getTransforms(TanaViewPlugin)
              .view.setType(view.id, nextType as TanaViewDefinition['type'])
          }
        >
          <SelectTrigger aria-label="选择视图展示方式" className="h-7 w-24 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-[var(--tana-hover)]">
            <LayoutPanelTopIcon className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(viewTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TanaViewFilterControls index={index} results={results} view={view} />
        {controls && <div className="ml-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">{controls}</div>}
        <button
          aria-label="隐藏工具栏"
          className="ml-auto rounded px-2 py-1 text-xs text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
          type="button"
          onClick={() => editor.getTransforms(TanaViewPlugin).view.update(view.id, { toolbarVisible: false })}
        >
          隐藏
        </button>
      </div>
    </header>
  );
}
