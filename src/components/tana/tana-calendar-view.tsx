'use client';

import { ArrowUpRightIcon, CalendarDaysIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { formatTanaDay, isTanaDay, type TanaDay } from '@/lib/tana/time';
import { resolveTanaNodeTitle } from '@/lib/tana/title';
import type { TanaIndex, TanaNode } from '@/lib/tana/types';

type CalendarEntry = {
  day: TanaDay;
  node: TanaNode;
};

/**
 * Derives calendar placements from canonical Day Node semantics and canonical
 * Date Field values. It deliberately stores neither events nor a calendar
 * projection: editing or moving a Node is immediately reflected on next render.
 */
export function getTanaCalendarEntries(
  index: TanaIndex,
  results: readonly TanaNode[]
): CalendarEntry[] {
  const seen = new Set<string>();
  const entries: CalendarEntry[] = [];

  for (const node of results) {
    const days = new Set<TanaDay>();

    if (node.time?.unit === 'day' && isTanaDay(node.time.value)) {
      days.add(node.time.value);
    }

    for (const field of index.fieldNodesByParent.get(node.id) ?? []) {
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

export function TanaCalendarView({
  index,
  results,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
}) {
  const editor = useEditorRef();
  const entries = getTanaCalendarEntries(index, results);
  const days = Array.from(new Set(entries.map(({ day }) => day)));

  if (entries.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
        <div>
          <CalendarDaysIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="font-medium text-sm">没有可显示的日期</p>
          <p className="mt-1 text-muted-foreground text-xs">
            为结果添加日期字段，或在每日笔记中创建日期节点。
          </p>
        </div>
      </div>
    );
  }

  return (
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
                  <ArrowUpRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
