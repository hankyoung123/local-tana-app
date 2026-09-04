'use client';

import { Columns3Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TanaIndex, TanaNode } from '@/lib/tana';

import { NodeProjection } from './node-projection';
import { getTanaTableAvailableFieldIds } from './tana-table-view';

/** Cards project title, tags, and selected real Fields; no Card entity exists. */
export function TanaCardsView({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const configuredVisibleFieldIds = view.viewDefinition?.visibleFieldIds;
  const fieldIds = getTanaTableAvailableFieldIds(index, results, configuredVisibleFieldIds);
  const visibleFieldIds = configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((node) => (
          <article
            key={node.id}
            className="cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
          >
            <NodeProjection
              fieldIds={visibleFieldIds}
              index={index}
              targetNodeId={node.id}
              variant="search-result"
            />
          </article>
        ))}
      </div>
    </div>
  );
}

export function TanaCardsToolbarControls({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const configuredVisibleFieldIds = view.viewDefinition?.visibleFieldIds;
  const fieldIds = getTanaTableAvailableFieldIds(index, results, configuredVisibleFieldIds);
  const visibleFieldIds = configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds;

  if (fieldIds.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="选择卡片显示字段"
          className="inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2 text-xs hover:bg-muted"
          type="button"
        >
          <Columns3Icon className="size-3.5" />
          显示
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>显示字段</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {fieldIds.map((fieldId) => (
          <DropdownMenuCheckboxItem
            key={fieldId}
            checked={visibleFieldIds.includes(fieldId)}
            onCheckedChange={(checked) => {
              const nextVisibleFieldIds = new Set(
                configuredVisibleFieldIds ?? fieldIds
              );

              if (checked) nextVisibleFieldIds.add(fieldId);
              else nextVisibleFieldIds.delete(fieldId);

              editor.getTransforms(TanaViewPlugin).view.update(view.id, {
                visibleFieldIds: fieldIds.filter((candidateId) =>
                  nextVisibleFieldIds.has(candidateId)
                ),
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
