'use client';

import * as React from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
} from 'lucide-react';
import { useEditorRef } from 'platejs/react';
import type { PlateEditor } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  addTanaDays,
  formatTanaDay,
  getTanaToday,
  getTanaWeekStart,
  isTanaDay,
  type TanaDay,
} from '@/lib/tana/time';
import {
  getTanaProjectionTarget,
  getTanaViewFieldValueLabel,
  resolveTanaNodeTitle,
  resolveTanaViewProjection,
  type NodeId,
  type TanaIndex,
  type TanaNode,
  type TanaViewProjection,
} from '@/lib/tana';

import { createTanaViewNode } from './tana-view-actions';
import { TanaViewDisplayFieldsControl } from './tana-view-display-fields-control';

export type TanaCalendarEntry = {
  day: TanaDay;
  /** The source occurrence remains the navigation identity. */
  node: TanaNode;
  /** The exact canonical Date Field that produced this placement. */
  fieldId: NodeId;
  target: TanaNode;
};

type CalendarMode = 'day' | 'week' | 'month';

/** Existing Field writer keeps Calendar drops canonical, including References. */
export function setTanaCalendarDate(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  day: TanaDay
): boolean {
  const fields = editor.getTransforms(TanaFieldPlugin).field;
  const write = () => {
    if (!fields.materialize(nodeId, fieldId)) return false;
    return fields.setValue(nodeId, fieldId, {
      type: 'date',
      value: day,
    });
  };

  if (editor.api.isMerging()) return write();

  let result = false;
  editor.tf.withNewBatch(() => {
    result = write();
  });
  return result;
}

/** Calendar Add creates its canonical Node and Date Field in one undo batch. */
export function createTanaCalendarNode(
  editor: PlateEditor,
  viewId: NodeId,
  fieldId: NodeId,
  day: TanaDay
): NodeId | undefined {
  let nodeId: NodeId | undefined;
  editor.tf.withNewBatch(() => {
    nodeId = createTanaViewNode(editor, viewId);
    if (nodeId) setTanaCalendarDate(editor, nodeId, fieldId, day);
  });
  return nodeId;
}

export function getTanaDateFieldIds(index: TanaIndex, results: readonly TanaNode[]) {
  const ids = new Set<NodeId>();
  for (const node of index.nodesById.values()) {
    if (node.fieldDefinition?.type === 'date') ids.add(node.id);
  }
  for (const occurrence of results) {
    const target = getTanaProjectionTarget(index, occurrence.id);
    if (!target) continue;
    for (const field of index.fieldNodesByParent.get(target.id) ?? []) {
      if (index.nodesById.get(field.fieldId)?.fieldDefinition?.type === 'date') ids.add(field.fieldId);
    }
  }
  return [...ids];
}

/** Calendar placement derives only from Date Field value Nodes on canonical targets. */
export function getTanaCalendarEntries(
  index: TanaIndex,
  results: readonly TanaNode[],
  dateFieldIds?: readonly NodeId[]
): TanaCalendarEntry[] {
  // Undefined means use every available Date Field. An empty list is a
  // deliberate persisted choice to show no dated placements.
  const selected = dateFieldIds === undefined ? undefined : new Set(dateFieldIds);
  const seen = new Set<string>();
  const entries: TanaCalendarEntry[] = [];

  for (const node of results) {
    const target = getTanaProjectionTarget(index, node.id);
    if (!target) continue;
    for (const field of index.fieldNodesByParent.get(target.id) ?? []) {
      if (index.nodesById.get(field.fieldId)?.fieldDefinition?.type !== 'date') continue;
      if (selected && !selected.has(field.fieldId)) continue;
      for (const value of field.values) {
        if (value.type !== 'date' || !isTanaDay(value.value)) continue;
        const key = `${value.value}:${node.id}:${field.fieldId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ day: value.value, fieldId: field.fieldId, node, target });
      }
    }
  }

  return entries.sort(
    (left, right) =>
      left.day.localeCompare(right.day) ||
      resolveTanaNodeTitle(index, left.target.id).localeCompare(resolveTanaNodeTitle(index, right.target.id))
  );
}

export function getTanaCalendarMonth(day: TanaDay): string {
  return day.slice(0, 7);
}

export function addTanaCalendarMonths(month: string, delta: number): string {
  const parsed = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parsed) return getTanaCalendarMonth(getTanaToday());
  const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1 + delta, 1));
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

export function formatTanaCalendarMonth(month: string): string {
  const parsed = /^(\d{4})-(\d{2})$/.exec(month);
  return parsed ? `${parsed[1]} 年 ${Number(parsed[2])} 月` : month;
}

/** Moves one complete presentation range without storing Calendar cursor state. */
export function moveTanaCalendarCursor(mode: CalendarMode, cursor: TanaDay, delta: number): TanaDay {
  if (mode === 'month') {
    return `${addTanaCalendarMonths(getTanaCalendarMonth(cursor), delta)}-01` as TanaDay;
  }
  return addTanaDays(cursor, delta * (mode === 'week' ? 7 : 1));
}

function selectCalendarDateFieldIds(index: TanaIndex, view: TanaNode, results: readonly TanaNode[]) {
  const available = getTanaDateFieldIds(index, results);
  const configured = view.viewDefinition?.calendarDateFieldIds;
  return configured
    ? configured.filter((fieldId) => available.includes(fieldId))
    : available;
}

export function calendarDays(mode: CalendarMode, cursor: TanaDay, _entries: readonly TanaCalendarEntry[] = []) {
  void _entries;
  if (mode === 'day') return [cursor];
  if (mode === 'week') {
    const start = getTanaWeekStart(cursor);
    return Array.from({ length: 7 }, (_, offset) => addTanaDays(start, offset));
  }
  const month = getTanaCalendarMonth(cursor);
  const parsed = /^(\d{4})-(\d{2})$/.exec(month);
  if (!parsed) return [];
  const year = Number(parsed[1]);
  const monthIndex = Number(parsed[2]);
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Array.from(
    { length: daysInMonth },
    (_, day) => `${parsed[1]}-${parsed[2]}-${String(day + 1).padStart(2, '0')}` as TanaDay
  );
}

export function TanaCalendarView({
  index,
  projection,
  results,
  view,
}: {
  index: TanaIndex;
  projection?: TanaViewProjection;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const resolved = projection ?? resolveTanaViewProjection(index, view, results);
  const activeDateFieldIds = selectCalendarDateFieldIds(index, view, resolved.items.map(({ occurrence }) => occurrence));
  const entries = getTanaCalendarEntries(index, resolved.items.map(({ occurrence }) => occurrence), activeDateFieldIds);
  const [mode, setMode] = React.useState<CalendarMode>('month');
  const [cursor, setCursor] = React.useState<TanaDay>(entries[0]?.day ?? getTanaToday());
  const days = calendarDays(mode, cursor, entries);
  const datedIds = new Set(entries.map(({ node }) => node.id));
  const undated = resolved.items.filter(({ occurrence }) => !datedIds.has(occurrence.id));
  const writeDate = (nodeId: NodeId, fieldId: NodeId, day: TanaDay) =>
    setTanaCalendarDate(editor, nodeId, fieldId, day);
  const defaultDateFieldId = activeDateFieldIds[0];
  const addOnDay = (day: TanaDay) => {
    if (!defaultDateFieldId) return;
    createTanaCalendarNode(editor, view.id, defaultDateFieldId, day);
  };
  const go = (delta: number) =>
    setCursor((current) => moveTanaCalendarCursor(mode, current, delta));

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(value) => setMode(value as CalendarMode)}>
          <SelectTrigger aria-label="日历范围" className="h-7 w-24 border-0 bg-transparent px-2 text-xs shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">日</SelectItem>
            <SelectItem value="week">周</SelectItem>
            <SelectItem value="month">月</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          <Button aria-label="上一个日期范围" size="icon" type="button" variant="ghost" onClick={() => go(-1)}><ArrowLeftIcon /></Button>
          <span aria-live="polite" className="min-w-28 text-center font-medium text-sm">
            {mode === 'month' ? formatTanaCalendarMonth(getTanaCalendarMonth(cursor)) : formatTanaDay(cursor)}
          </span>
          <Button aria-label="下一个日期范围" size="icon" type="button" variant="ghost" onClick={() => go(1)}><ArrowRightIcon /></Button>
          <Button className="ml-1" size="sm" type="button" variant="outline" onClick={() => setCursor(getTanaToday())}>今天</Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <section
            key={day}
            className="overflow-hidden rounded-lg border bg-[var(--tana-canvas)]"
            onDragOver={(event) => defaultDateFieldId && event.preventDefault()}
            onDrop={(event) => {
              const payload = event.dataTransfer.getData('application/x-tana-calendar-entry');
              const [nodeId, fieldId] = payload.split(':');
              const dateFieldId = fieldId || defaultDateFieldId;
              if (!nodeId || !dateFieldId) return;
              event.preventDefault();
              writeDate(nodeId, dateFieldId, day);
            }}
          >
            <h2 className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 font-medium text-sm">
              {formatTanaDay(day)}
              {defaultDateFieldId && <button className="text-xs text-[var(--tana-link)]" type="button" onClick={() => addOnDay(day)}>添加</button>}
            </h2>
            <div className="divide-y">
              {entries.filter((entry) => entry.day === day).map((entry) => (
                <button
                  draggable
                  key={`${entry.node.id}:${entry.fieldId}`}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                  type="button"
                  onDragStart={(event) => event.dataTransfer.setData('application/x-tana-calendar-entry', `${entry.node.id}:${entry.fieldId}`)}
                  onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(entry.target.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{resolveTanaNodeTitle(index, entry.target.id) || '未命名节点'}</span>
                  {resolved.visibleFieldIds.map((fieldId) => {
                    const value = getTanaViewFieldValueLabel(index, entry.target.id, fieldId);
                    return value ? <span className="max-w-24 truncate text-xs text-muted-foreground" key={fieldId}>{value}</span> : null;
                  })}
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-dashed p-3">
        <h2 className="mb-2 text-xs font-medium text-[var(--tana-text-tertiary)]">未安排 · {undated.length}</h2>
        {undated.length === 0 ? <p className="text-xs text-muted-foreground">没有未安排节点</p> : (
          <div className="flex flex-wrap gap-2">
            {undated.map(({ occurrence, target }) => (
              <button
                draggable
                key={occurrence.id}
                className="rounded bg-muted px-2 py-1 text-xs hover:bg-muted/70"
                type="button"
                onDragStart={(event) => event.dataTransfer.setData('application/x-tana-calendar-entry', `${occurrence.id}:${defaultDateFieldId ?? ''}`)}
                onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(target.id)}
              >
                {resolveTanaNodeTitle(index, target.id) || '未命名节点'}
              </button>
            ))}
          </div>
        )}
      </section>
      {entries.length === 0 && undated.length === 0 && (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed text-center">
          <div><CalendarDaysIcon className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="font-medium text-sm">没有可显示节点</p></div>
        </div>
      )}
    </div>
  );
}

export function TanaCalendarToolbarControls({ index, results, view }: { index: TanaIndex; results: readonly TanaNode[]; view: TanaNode }) {
  const editor = useEditorRef();
  const dateFieldIds = getTanaDateFieldIds(index, results);
  const selected = selectCalendarDateFieldIds(index, view, results);
  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="选择日历日期字段" className="inline-flex h-7 items-center rounded px-2 text-xs hover:bg-[var(--tana-hover)]" type="button">日期字段 {selected.length ? `(${selected.length})` : ''}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>日历日期字段</DropdownMenuLabel><DropdownMenuSeparator />
        {dateFieldIds.map((fieldId) => (
          <DropdownMenuCheckboxItem key={fieldId} checked={selected.includes(fieldId)} onCheckedChange={(checked) => {
            const next = new Set(selected);
            if (checked) next.add(fieldId); else next.delete(fieldId);
            editor.getTransforms(TanaViewPlugin).view.update(view.id, { calendarDateFieldIds: [...next] });
          }}>
            {index.nodesById.get(fieldId)?.text || '未命名日期字段'}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
    <TanaViewDisplayFieldsControl index={index} label="选择日历显示字段" results={results} view={view} />
    </>
  );
}
