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

const viewTypeLabels: Record<TanaViewDefinition['type'], string> = {
  calendar: '日历',
  cards: '卡片',
  outline: '大纲',
  table: '表格',
};

/**
 * Shared, document-backed chrome for every View. Individual renderers add
 * only controls that are meaningful for their presentation (columns, date
 * field, and so on); this component owns neither result data nor local state.
 */
export function TanaViewToolbar({
  controls,
  index,
  view,
}: {
  controls?: ReactNode;
  index: TanaIndex;
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const type = view.viewDefinition?.type ?? 'outline';

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
        {controls && <div className="ml-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">{controls}</div>}
      </div>
    </header>
  );
}
