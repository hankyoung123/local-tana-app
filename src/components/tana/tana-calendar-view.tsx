'use client';

import * as React from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
} from 'lucide-react';
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
import { formatTanaDay, getTanaToday, isTanaDay, type TanaDay } from '@/lib/tana/time';
import { resolveTanaNodeTitle } from '@/lib/tana/title';
import type { NodeId, TanaIndex, TanaNode } from '@/lib/tana/types';

const ALL_DATES = '__all-dates__';

export type TanaCalendarEntry = {
  day: TanaDay;
  node: TanaNode;
};

function getTanaDateFieldIds(index: TanaIndex, results: readonly TanaNode[]) {
  return Array.from(
    new Set(
      results.flatMap((node) =>
        (index.fieldNodesByParent.get(node.id) ?? [])
          .filter((field) => index.nodesById.get(field.fieldId)?.fieldDefinition?.type === 'date')
          .map((field) => field.fieldId)
      )
    )
  );
}

/**
 * Derives calendar placements from canonical Day Node semantics and Date Field
 * values. A selected field changes only the rendering filter; it never creates
 * a calendar event or a duplicate Date representation.
 */
export function getTanaCalendarEntries(
  index: TanaIndex,
  results: readonly TanaNode[],
  dateFieldId?: NodeId
): TanaCalendarEntry[] {
  const seen = new Set<string>();
  const entries: TanaCalendarEntry[] = [];

  for (const node of results) {
    const days = new Set<TanaDay>();

    if (node.time?.unit === 'day' && isTanaDay(node.time.value)) {
      days.add(node.time.value);
    }

    for (const field of index.fieldNodesByParent.get(node.id) ?? []) {
      if (dateFieldId && field.fieldId !== dateFieldId) continue;

      for (const value of field.values) {
        if (value.type === 'date' && isTanaDay(value.value)) days.add(value.value);
      }
    }

    for (const day of days) {
      const key = `${day}:${node.id}`;

      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ day, node });
    }
  }

  return entries.sort(
    (left, right) =>
      left.day.localeCompare(right.day) ||
      resolveTanaNodeTitle(index, left.node.id).localeCompare(
        resolveTanaNodeTitle(index, right.node.id)
      )
  );
}

export function getTanaCalendarMonth(day: TanaDay): string {
  return day.slice(0, 7);
}

export function addTanaCalendarMonths(month: string, delta: number): string {
  const parsed = /^([0-9]{4})-([0-9]{2})$/.exec(month);

  if (!parsed) return getTanaCalendarMonth(getTanaToday());

  const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1 + delta, 1));

  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

export function formatTanaCalendarMonth(month: string): string {
  const parsed = /^([0-9]{4})-([0-9]{2})$/.exec(month);

  if (!parsed) return month;

  return `${parsed[1]} 年 ${Number(parsed[2])} 月`;
}

export function TanaCalendarView({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const dateFieldIds = getTanaDateFieldIds(index, results);
  const dateFieldId = view.viewDefinition?.calendarDateFieldId;
  const activeDateFieldId =
    dateFieldId && dateFieldIds.includes(dateFieldId) ? dateFieldId : undefined;
  const entries = getTanaCalendarEntries(index, results, activeDateFieldId);
  const initialMonth = getTanaCalendarMonth(entries[0]?.day ?? getTanaToday());
  const [month, setMonth] = React.useState(initialMonth);

  const days = Array.from(
    new Set(
      entries
        .filter((entry) => getTanaCalendarMonth(entry.day) === month)
        .map(({ day }) => day)
    )
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={activeDateFieldId ?? ALL_DATES}
          onValueChange={(value) =>
            editor.getTransforms(TanaViewPlugin).view.update(view.id, {
              calendarDateFieldId: value === ALL_DATES ? undefined : value,
            })
          }
        >
          <SelectTrigger aria-label="选择日历日期字段" className="h-8 w-44 bg-white text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DATES}>所有日期字段</SelectItem>
            {dateFieldIds.map((fieldId) => (
              <SelectItem key={fieldId} value={fieldId}>
                {index.nodesById.get(fieldId)?.text || '未命名日期字段'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-label="上个月"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setMonth((current) => addTanaCalendarMonths(current, -1))}
          >
            <ArrowLeftIcon />
          </Button>
          <span aria-live="polite" className="min-w-28 text-center font-medium text-sm">
            {formatTanaCalendarMonth(month)}
          </span>
          <Button
            aria-label="下个月"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setMonth((current) => addTanaCalendarMonths(current, 1))}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            className="ml-1"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setMonth(getTanaCalendarMonth(getTanaToday()))}
          >
            今天
          </Button>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
          <div>
            <CalendarDaysIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="font-medium text-sm">这个月没有可显示的日期</p>
            <p className="mt-1 text-muted-foreground text-xs">
              为结果添加日期字段，或在每日笔记中创建日期节点。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => (
            <section key={day} className="overflow-hidden rounded-lg border bg-white">
              <h2 className="border-b bg-muted/30 px-3 py-2 font-medium text-sm">
                {formatTanaDay(day)}
              </h2>
              <div className="divide-y">
                {entries
                  .filter((entry) => entry.day === day)
                  .map(({ node }) => (
                    <button
                      key={node.id}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                      type="button"
                      onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {resolveTanaNodeTitle(index, node.id) || '未命名节点'}
                      </span>
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
