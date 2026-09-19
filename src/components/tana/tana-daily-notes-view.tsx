'use client';

import * as React from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
} from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaTimePlugin } from '@/components/editor/plugins/tana-time-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Button } from '@/components/ui/button';
import {
  getTanaDayParts,
  getTanaMonthForDay,
  getTanaToday,
  getTanaWeekForDay,
  getTanaYearForDay,
  isTanaDay,
  type TanaDay,
} from '@/lib/tana/time';
import { resolveTanaNodeTitle } from '@/lib/tana/title';
import type { NodeId, TanaBlockElement, TanaIndex, TanaNode } from '@/lib/tana/types';

export type TanaDailyNotesGroup = {
  label: string;
  nodes: readonly TanaNode[];
};

/** Groups canonical Day Nodes below Daily Notes through Year/Week parents. */
export function getTanaDailyNotesGroups(
  index: TanaIndex,
  dailyNotesId: NodeId
): TanaDailyNotesGroup[] {
  const groups = new Map<string, TanaNode[]>();

  for (const node of index.nodesById.values()) {
    const day = node?.time?.unit === 'day' ? node.time.value : undefined;

    if (!node || !day || !isTanaDay(day)) continue;
    const weekId = index.parentNodeIds.get(node.id);
    const yearId = weekId ? index.parentNodeIds.get(weekId) : undefined;
    const week = weekId ? index.nodesById.get(weekId)?.time : undefined;
    const yearTime = yearId ? index.nodesById.get(yearId)?.time : undefined;
    if (
      !weekId ||
      !yearId ||
      week?.unit !== 'week' ||
      week.value !== getTanaWeekForDay(day) ||
      yearTime?.unit !== 'year' ||
      yearTime.value !== week.value.slice(0, 4) ||
      index.parentNodeIds.get(yearId) !== dailyNotesId
    ) continue;

    const { month, year } = getTanaDayParts(day as TanaDay);
    const label = `${year} 年 ${month} 月`;
    const current = groups.get(label) ?? [];

    current.push(node);
    groups.set(label, current);
  }

  return Array.from(groups, ([label, nodes]) => ({ label, nodes }));
}

/** Daily Notes is a pure grouped projection of its normal Day child Nodes. */
export function TanaDailyNotesView({
  index,
  node,
}: {
  index: TanaIndex;
  node: TanaNode;
}) {
  const editor = useEditorRef();
  const [dayInput, setDayInput] = React.useState('');
  const [weekInput, setWeekInput] = React.useState('');
  const [monthInput, setMonthInput] = React.useState('');
  const [yearInput, setYearInput] = React.useState('');
  const groups = getTanaDailyNotesGroups(index, node.id);
  const time = editor.getTransforms(TanaTimePlugin).time;
  const workspaceId = index.systemNodeIds.get('workspace');
  const workspace = workspaceId
    ? (index.nodesById.get(workspaceId)?.node as TanaBlockElement | undefined)
    : undefined;
  const workspaceTimeZone = typeof workspace?.tanaWorkspaceTimeZone === 'string'
    ? workspace.tanaWorkspaceTimeZone
    : 'UTC';

  const getCurrentDay = () => getTanaToday(workspaceTimeZone);

  const goToInputDay = () => {
    if (!dayInput) return;

    time.goToDay(dayInput);
  };

  const goToInputWeek = () => {
    if (!weekInput) return;

    time.goToWeek(weekInput);
  };

  const goToInputMonth = () => {
    if (!monthInput) return;

    time.goToMonth(monthInput);
  };

  const goToInputYear = () => {
    if (!yearInput) return;

    time.goToYear(yearInput);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="shrink-0 border-b px-6 py-5 sm:px-10">
        <p className="mb-1 text-muted-foreground text-xs">每日笔记</p>
        <h1 className="font-semibold text-2xl">{resolveTanaNodeTitle(index, node.id)}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            aria-label="前一天"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => time.previousDay()}
          >
            <ArrowLeftIcon />
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => time.today()}>
            <CalendarDaysIcon />
            今天
          </Button>
          <Button
            aria-label="后一天"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => time.nextDay()}
          >
            <ArrowRightIcon />
          </Button>
          <label className="ml-1 flex h-8 items-center rounded border bg-white px-2">
            <span className="sr-only">前往指定日期</span>
            <input
              aria-label="前往指定日期"
              className="w-32 bg-transparent text-xs outline-none"
              type="date"
              value={dayInput}
              onBlur={goToInputDay}
              onChange={(event) => setDayInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToInputDay();
                }
              }}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            aria-label="打开本周"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => time.goToWeek(getTanaWeekForDay(getCurrentDay()))}
          >
            本周
          </Button>
          <label className="flex h-8 items-center rounded border bg-white px-2">
            <span className="sr-only">前往指定周</span>
            <input
              aria-label="前往指定周"
              className="w-28 bg-transparent text-xs outline-none"
              type="week"
              value={weekInput}
              onBlur={goToInputWeek}
              onChange={(event) => setWeekInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToInputWeek();
                }
              }}
            />
          </label>
          <Button
            aria-label="打开本月"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => time.goToMonth(getTanaMonthForDay(getCurrentDay()))}
          >
            本月
          </Button>
          <label className="flex h-8 items-center rounded border bg-white px-2">
            <span className="sr-only">前往指定月份</span>
            <input
              aria-label="前往指定月份"
              className="w-28 bg-transparent text-xs outline-none"
              type="month"
              value={monthInput}
              onBlur={goToInputMonth}
              onChange={(event) => setMonthInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToInputMonth();
                }
              }}
            />
          </label>
          <Button
            aria-label="打开今年"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => time.goToYear(getTanaYearForDay(getCurrentDay()))}
          >
            今年
          </Button>
          <label className="flex h-8 items-center rounded border bg-white px-2">
            <span className="sr-only">前往指定年份</span>
            <input
              aria-label="前往指定年份"
              className="w-16 bg-transparent text-xs outline-none"
              inputMode="numeric"
              pattern="\\d{4}"
              type="text"
              value={yearInput}
              onBlur={goToInputYear}
              onChange={(event) => setYearInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToInputYear();
                }
              }}
            />
          </label>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {groups.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <CalendarDaysIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="font-medium text-sm">尚未创建每日笔记</p>
              <p className="mt-1 text-muted-foreground text-xs">选择“今天”即可创建或打开当天节点。</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 font-medium text-muted-foreground text-xs">{group.label}</h2>
                <div className="mx-auto max-w-3xl divide-y rounded-lg border">
                  {group.nodes.map((dayNode) => (
                    <button
                      key={dayNode.id}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50"
                      type="button"
                      onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(dayNode.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {resolveTanaNodeTitle(index, dayNode.id)}
                      </span>
                      <ArrowUpRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
