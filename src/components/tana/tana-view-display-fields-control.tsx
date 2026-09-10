'use client';

import { Columns3Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resolveTanaViewProjection, type TanaIndex, type TanaNode } from '@/lib/tana';

/** A shared persisted `visibleFieldIds` editor for projection renderers. */
export function TanaViewDisplayFieldsControl({
  index,
  label = '选择显示字段',
  results,
  view,
}: {
  index: TanaIndex;
  label?: string;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const projection = resolveTanaViewProjection(index, view, results);
  const configured = view.viewDefinition?.visibleFieldIds;
  const { availableFieldIds, visibleFieldIds } = projection;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={label} className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[var(--tana-text-secondary)] text-xs hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]" type="button">
          <Columns3Icon className="size-3.5" />显示
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>显示字段</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableFieldIds.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">当前结果没有字段</p> : availableFieldIds.map((fieldId) => (
          <DropdownMenuCheckboxItem
            key={fieldId}
            checked={visibleFieldIds.includes(fieldId)}
            onCheckedChange={(checked) => {
              const next = new Set(configured ?? availableFieldIds);
              if (checked) next.add(fieldId);
              else next.delete(fieldId);
              editor.getTransforms(TanaViewPlugin).view.update(view.id, {
                visibleFieldIds: availableFieldIds.filter((candidate) => next.has(candidate)),
              });
            }}
          >
            {index.nodesById.get(fieldId)?.text || '未命名字段'}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
