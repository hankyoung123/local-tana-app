'use client';

import { GroupIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveTanaViewProjection, type TanaIndex, type TanaNode } from '@/lib/tana';

/** Group control is intentionally exposed only by Outline and Cards. */
export function TanaViewGroupControl({ index, results, view }: { index: TanaIndex; results: readonly TanaNode[]; view: TanaNode }) {
  const editor = useEditorRef();
  const projection = resolveTanaViewProjection(index, view, results);
  return (
    <Select value={view.viewDefinition?.groupFieldId ?? '__none__'} onValueChange={(fieldId) =>
      editor.getTransforms(TanaViewPlugin).view.update(view.id, { groupFieldId: fieldId === '__none__' ? undefined : fieldId })
    }>
      <SelectTrigger aria-label="按字段分组" className="h-7 w-28 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-[var(--tana-hover)]"><GroupIcon className="size-3.5" /><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">不分组</SelectItem>
        {projection.availableFieldIds.map((fieldId) => <SelectItem key={fieldId} value={fieldId}>按{index.nodesById.get(fieldId)?.text || '字段'}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
