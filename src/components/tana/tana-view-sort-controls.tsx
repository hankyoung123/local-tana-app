'use client';

import * as React from 'react';
import { ArrowDownAZIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveTanaViewProjection, type NodeId, type TanaIndex, type TanaNode, type TanaViewDefinition } from '@/lib/tana';

const TITLE_SORT = '$title';
type Criterion = NonNullable<TanaViewDefinition['sort']>[number];

function criterionValue(criterion: Criterion) {
  return `${criterion.fieldId}:${criterion.direction}`;
}

/**
 * One persisted multi-sort editor shared by Outline, Table, and Cards.
 * It only changes View configuration; the projection remains the sole sorter.
 */
export function TanaViewSortControls({ index, results, view }: { index: TanaIndex; results: readonly TanaNode[]; view: TanaNode }) {
  const editor = useEditorRef();
  const projection = resolveTanaViewProjection(index, view, results);
  const criteria = [...(view.viewDefinition?.sort ?? [])];
  const fieldIds = projection.availableFieldIds;
  const fieldName = (fieldId: string) => fieldId === TITLE_SORT
    ? '标题'
    : index.nodesById.get(fieldId)?.text || '未命名字段';
  const write = (next: readonly Criterion[]) =>
    editor.getTransforms(TanaViewPlugin).view.update(view.id, {
      sort: next.length ? next : undefined,
    });
  const parse = (value: string): Criterion | undefined => {
    const separator = value.lastIndexOf(':');
    const fieldId = value.slice(0, separator);
    const direction = value.slice(separator + 1);
    return fieldId && (direction === 'asc' || direction === 'desc')
      ? { direction, fieldId: fieldId === TITLE_SORT ? TITLE_SORT : fieldId as NodeId }
      : undefined;
  };
  const options = [TITLE_SORT, ...fieldIds];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="排序视图结果" className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-[var(--tana-hover)]" type="button">
          <ArrowDownAZIcon className="size-3.5" />排序{criteria.length ? ` (${criteria.length})` : ''}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        <DropdownMenuLabel>排序条件</DropdownMenuLabel>
        <div className="space-y-1 px-1 py-1">
          {criteria.length === 0 && <p className="py-1 text-xs text-muted-foreground">文档顺序</p>}
          {criteria.map((criterion, position) => (
            <div className="flex items-center gap-1" key={`${position}:${criterionValue(criterion)}`}>
              <span aria-hidden="true" className="w-4 text-center text-xs text-muted-foreground">{position + 1}</span>
              <Select value={criterionValue(criterion)} onValueChange={(value) => {
                const next = parse(value);
                if (!next) return;
                write(criteria.map((current, indexInList) => indexInList === position ? next : current));
              }}>
                <SelectTrigger aria-label={`排序条件 ${position + 1}`} className="h-7 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((fieldId) => <React.Fragment key={fieldId}>
                    <SelectItem value={`${fieldId}:asc`}>{fieldName(fieldId)} ↑</SelectItem>
                    <SelectItem value={`${fieldId}:desc`}>{fieldName(fieldId)} ↓</SelectItem>
                  </React.Fragment>)}
                </SelectContent>
              </Select>
              <button aria-label={`上移排序条件 ${position + 1}`} className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={position === 0} type="button" onClick={() => {
                const next = [...criteria];
                [next[position - 1], next[position]] = [next[position]!, next[position - 1]!];
                write(next);
              }}><ArrowUpIcon className="size-3" /></button>
              <button aria-label={`下移排序条件 ${position + 1}`} className="rounded p-1 hover:bg-muted disabled:opacity-40" disabled={position === criteria.length - 1} type="button" onClick={() => {
                const next = [...criteria];
                [next[position], next[position + 1]] = [next[position + 1]!, next[position]!];
                write(next);
              }}><ArrowDownIcon className="size-3" /></button>
              <button aria-label={`移除排序条件 ${position + 1}`} className="rounded p-1 hover:bg-muted" type="button" onClick={() => write(criteria.filter((_, indexInList) => indexInList !== position))}><XIcon className="size-3" /></button>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <Select value="__add__" onValueChange={(value) => {
          if (value === '__add__') return;
          const next = parse(value);
          if (next) write([...criteria, next]);
        }}>
          <SelectTrigger aria-label="添加排序条件" className="mt-1 h-7 w-full text-xs"><PlusIcon className="size-3" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__add__">添加排序条件</SelectItem>
            {options.map((fieldId) => <React.Fragment key={fieldId}>
              <SelectItem value={`${fieldId}:asc`}>{fieldName(fieldId)} ↑</SelectItem>
              <SelectItem value={`${fieldId}:desc`}>{fieldName(fieldId)} ↓</SelectItem>
            </React.Fragment>)}
          </SelectContent>
        </Select>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
