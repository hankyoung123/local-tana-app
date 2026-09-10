'use client';

import * as React from 'react';
import { FilterIcon, PlusIcon, XIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getTanaViewAvailableFieldIds,
  getFieldValueCandidates,
  type FieldValue,
  type NodeId,
  type TanaIndex,
  type TanaNode,
  type TanaViewFilterClause,
} from '@/lib/tana';

function clauseLabel(index: TanaIndex, clause: TanaViewFilterClause) {
  if (clause.kind === 'text-contains') return `标题包含：${clause.text}`;
  if (clause.kind === 'has-supertag') return `有超级标签：${index.nodesById.get(clause.supertagId)?.text || '已删除标签'}`;
  const field = index.nodesById.get(clause.fieldId)?.text || '已删除字段';
  if (clause.kind === 'field-set') return `${field}：已设置`;
  if (clause.kind === 'field-not-set') return `${field}：未设置`;
  if (clause.kind === 'field-equals') return `${field}：${String(clause.value.value)}`;
  return field;
}

function valueForField(type: string | undefined, raw: string): FieldValue | undefined {
  if (type === 'checkbox') return raw === 'true' || raw === 'false' ? { type, value: raw === 'true' } : undefined;
  if (type === 'number') {
    const value = Number(raw);
    return raw.trim() && Number.isFinite(value) ? { type, value } : undefined;
  }
  if (type === 'date' || type === 'email' || type === 'plain' || type === 'url') {
    return raw.trim() ? { type, value: raw } : undefined;
  }
  if (type === 'options' || type === 'from-supertag') {
    return raw.trim() ? { type, value: raw } : undefined;
  }
  return;
}

/** Small View-local filter editor. It writes only the persisted presentation config. */
export function TanaViewFilterControls({ index, results, view }: { index: TanaIndex; results: readonly TanaNode[]; view: TanaNode }) {
  const editor = useEditorRef();
  const availableFields = getTanaViewAvailableFieldIds(
    index,
    results.flatMap((occurrence) => {
      const target = index.nodesById.get(occurrence.referenceTargetId ?? occurrence.id);
      return target && target.referenceTargetId === undefined ? [{ occurrence, target }] : [];
    }),
    view.viewDefinition?.visibleFieldIds
  );
  const fields = Array.from(new Set([
    ...availableFields,
    ...Array.from(index.nodesById.values())
      .filter((node) => node.fieldDefinition)
      .map((node) => node.id),
  ]));
  const tags = Array.from(index.nodesById.values()).filter((node) => node.supertagDefinition);
  const [kind, setKind] = React.useState<'field-equals' | 'field-not-set' | 'field-set' | 'has-supertag'>('field-set');
  const [fieldId, setFieldId] = React.useState<NodeId | undefined>(fields[0]);
  const [supertagId, setSupertagId] = React.useState<NodeId | undefined>(tags[0]?.id);
  const [value, setValue] = React.useState('');
  const clauses = view.viewDefinition?.filter?.clauses ?? [];
  const add = (clause: TanaViewFilterClause) =>
    editor.getTransforms(TanaViewPlugin).view.update(view.id, {
      filter: { clauses: [...clauses, clause], mode: view.viewDefinition?.filter?.mode ?? 'and' },
    });
  const remove = (position: number) => {
    const next = clauses.filter((_, indexInList) => indexInList !== position);
    editor.getTransforms(TanaViewPlugin).view.update(view.id, {
      filter: next.length ? { clauses: next, mode: view.viewDefinition?.filter?.mode ?? 'and' } : undefined,
    });
  };
  const selectedDefinition = fieldId ? index.nodesById.get(fieldId)?.fieldDefinition : undefined;
  const valueCandidates = fieldId && (selectedDefinition?.type === 'options' || selectedDefinition?.type === 'from-supertag')
    ? getFieldValueCandidates(index, fieldId)
    : [];
  const addSelected = () => {
    if (kind === 'has-supertag') {
      if (supertagId) add({ kind, supertagId });
      return;
    }
    if (!fieldId) return;
    if (kind === 'field-set' || kind === 'field-not-set') {
      add({ fieldId, kind });
      return;
    }
    const fieldValue = valueForField(selectedDefinition?.type, value);
    if (fieldValue) add({ fieldId, kind, value: fieldValue });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="筛选视图" className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-[var(--tana-hover)]" type="button">
          <FilterIcon className="size-3.5" />筛选{clauses.length ? ` (${clauses.length})` : ''}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <DropdownMenuLabel>筛选</DropdownMenuLabel>
        <div className="space-y-1 px-1 pb-2">
          {clauses.map((clause, position) => (
            <div className="flex items-center gap-1 text-xs" key={`${position}:${JSON.stringify(clause)}`}>
              <span className="min-w-0 flex-1 truncate">{clauseLabel(index, clause)}</span>
              <button aria-label={`移除筛选 ${position + 1}`} className="rounded p-0.5 hover:bg-muted" type="button" onClick={() => remove(position)}><XIcon className="size-3" /></button>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div className="space-y-2 p-1">
          <Input aria-label="标题文字筛选" placeholder="标题或文本包含" onKeyDown={(event) => {
            if (event.key === 'Enter' && event.currentTarget.value.trim()) {
              event.preventDefault();
              add({ kind: 'text-contains', text: event.currentTarget.value.trim() });
              event.currentTarget.value = '';
            }
          }} />
          <Select value={kind} onValueChange={(next) => setKind(next as typeof kind)}>
            <SelectTrigger aria-label="筛选类型" className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="field-set">字段已设置</SelectItem><SelectItem value="field-not-set">字段未设置</SelectItem>
              <SelectItem value="field-equals">字段等于</SelectItem><SelectItem value="has-supertag">超级标签</SelectItem>
            </SelectContent>
          </Select>
          {kind === 'has-supertag' ? (
            <Select value={supertagId} onValueChange={(next) => setSupertagId(next)}>
              <SelectTrigger aria-label="筛选超级标签" className="h-7 text-xs"><SelectValue placeholder="选择超级标签" /></SelectTrigger>
              <SelectContent>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.text || '未命名标签'}</SelectItem>)}</SelectContent>
            </Select>
          ) : <>
            <Select value={fieldId} onValueChange={(next) => setFieldId(next)}>
              <SelectTrigger aria-label="筛选字段" className="h-7 text-xs"><SelectValue placeholder="选择字段" /></SelectTrigger>
              <SelectContent>{fields.map((id) => <SelectItem key={id} value={id}>{index.nodesById.get(id)?.text || '未命名字段'}</SelectItem>)}</SelectContent>
            </Select>
            {kind === 'field-equals' && (selectedDefinition?.type === 'checkbox' ? (
              <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="字段筛选值" className="h-7 text-xs"><SelectValue placeholder="选择布尔值" /></SelectTrigger><SelectContent><SelectItem value="true">已勾选</SelectItem><SelectItem value="false">未勾选</SelectItem></SelectContent></Select>
            ) : valueCandidates.length > 0 ? (
              <Select value={value} onValueChange={setValue}><SelectTrigger aria-label="字段筛选值" className="h-7 text-xs"><SelectValue placeholder="选择字段值" /></SelectTrigger><SelectContent>{valueCandidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.text || '未命名节点'}</SelectItem>)}</SelectContent></Select>
            ) : <Input aria-label="字段筛选值" placeholder="字段值" value={value} onChange={(event) => setValue(event.target.value)} />)}
          </>}
          <Button className="h-7 w-full text-xs" size="sm" type="button" variant="outline" onClick={addSelected}><PlusIcon />添加筛选</Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
