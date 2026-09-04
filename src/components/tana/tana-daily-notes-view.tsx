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
import { getTanaDayParts, type TanaDay } from '@/lib/tana/time';
import { resolveTanaNodeTitle } from '@/lib/tana/title';
import type { NodeId, TanaIndex, TanaNode } from '@/lib/tana/types';

export type TanaDailyNotesGroup = {
  label: string;
  nodes: readonly TanaNode[];
};

/** Groups only canonical Day Nodes; the labels are a read-only projection. */
export function getTanaDailyNotesGroups(
  index: TanaIndex,
  dailyNotesId: NodeId
): TanaDailyNotesGroup[] {
  const groups = new Map<string, TanaNode[]>();

  for (const childId of index.childrenByParent.get(dailyNotesId) ?? []) {
    const node = index.nodesById.get(childId);
    const day = node?.time?.unit === 'day' ? node.time.value : undefined;

    if (!node || !day) continue;

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
  const groups = getTanaDailyNotesGroups(index, node.id);
  const time = editor.getTransforms(TanaTimePlugin).time;

  const goToInputDay = () => {
    if (!dayInput) return;

    time.goToDay(dayInput);
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
