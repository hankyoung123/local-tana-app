'use client';

import type { ReactNode } from 'react';

import { ArrowLeftIcon, LayoutPanelTopIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveTanaNodeTitle, type TanaIndex, type TanaNode, type TanaViewDefinition } from '@/lib/tana';

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
  resultCount,
  sourceDescription,
  view,
}: {
  controls?: ReactNode;
  index: TanaIndex;
  resultCount: number;
  sourceDescription: string;
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const type = view.viewDefinition?.type ?? 'outline';

  return (
    <header className="shrink-0 border-b px-6 py-5 sm:px-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.out()}
        >
          <ArrowLeftIcon />
          返回上级
        </Button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {resultCount} 条结果
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-muted-foreground text-xs">视图节点</p>
          <h1 className="truncate font-semibold text-2xl">
            {resolveTanaNodeTitle(index, view.id)}
          </h1>
        </div>
        <Select
          value={type}
          onValueChange={(nextType) =>
            editor
              .getTransforms(TanaViewPlugin)
              .view.setType(view.id, nextType as TanaViewDefinition['type'])
          }
        >
          <SelectTrigger aria-label="选择视图展示方式" className="h-8 w-32 bg-white text-xs shadow-none">
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
          {sourceDescription}
        </span>
        <span className="text-muted-foreground text-xs">
          {viewTypeLabels[type]}展示
        </span>
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
    </header>
  );
}
