'use client';

import * as React from 'react';
import { Columns3Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NodeId, TanaIndex, TanaNode } from '@/lib/tana';

import { NodeProjection } from './node-projection';
import { getTanaTableFieldIds } from './tana-table-view';

/** Cards project title, tags, and selected real Fields; no Card entity exists. */
export function TanaCardsView({
  index,
  results,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
}) {
  const editor = useEditorRef();
  const fieldIds = getTanaTableFieldIds(index, results);
  const [hiddenFieldIds, setHiddenFieldIds] = React.useState<readonly NodeId[]>([]);
  const visibleFieldIds = fieldIds.filter((fieldId) => !hiddenFieldIds.includes(fieldId));

  return (
    <div className="space-y-3">
      {fieldIds.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="选择卡片显示字段"
              className="inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2 text-xs hover:bg-muted"
              type="button"
            >
              <Columns3Icon className="size-3.5" />
              卡片字段
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>显示字段</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {fieldIds.map((fieldId) => (
              <DropdownMenuCheckboxItem
                key={fieldId}
                checked={!hiddenFieldIds.includes(fieldId)}
                onCheckedChange={(checked) =>
                  setHiddenFieldIds((current) =>
                    checked
                      ? current.filter((currentFieldId) => currentFieldId !== fieldId)
                      : Array.from(new Set([...current, fieldId]))
                  )
                }
              >
                {index.nodesById.get(fieldId)?.text || '未命名字段'}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
