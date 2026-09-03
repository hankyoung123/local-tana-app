'use client';

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HashIcon,
  HomeIcon,
  ListFilterIcon,
} from 'lucide-react';
import * as React from 'react';
import { useEditorRef } from 'platejs/react';

import { TanaTimePlugin } from '@/components/editor/plugins/tana-time-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import type { NodeId, TanaIndex } from '@/lib/tana';
import { cn } from '@/lib/utils';

type TanaSidebarProps = {
  activeNodeId: NodeId | null;
  collapsed: boolean;
  index: TanaIndex;
  onCollapsedChange: (collapsed: boolean) => void;
  workspaceRootActive: boolean;
};

/** Quiet text navigation. Global search deliberately lives in the main shell. */
export function TanaSidebar({
  activeNodeId,
  collapsed,
  index,
  onCollapsedChange,
  workspaceRootActive,
}: TanaSidebarProps) {
  const editor = useEditorRef();
  const [dayInput, setDayInput] = React.useState('');
  const supertags = Array.from(index.nodesById.values()).filter(
    ({ semanticTypes }) => semanticTypes.includes('supertag-definition')
  );
  const views = Array.from(index.nodesById.values()).filter(
    ({ semanticTypes }) => semanticTypes.includes('view')
  );

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 justify-center border-r border-[#e6ebe8] bg-[#fafbfa] pt-3">
        <button
          aria-label="展开导航"
          className="grid size-7 place-items-center rounded-md text-[#7b827d] hover:bg-[#edf2ef] hover:text-[#202421]"
          type="button"
          onClick={() => onCollapsedChange(false)}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[#e6ebe8] bg-[#fafbfa]">
      <div className="flex h-12 items-center justify-between px-4">
        <span className="flex items-center gap-2 font-medium text-[13px]">
          <span className="grid size-5 place-items-center rounded-md bg-[#35654f] font-semibold text-white text-[10px]">
            T
          </span>
          Local Tana
        </span>
        <button
          aria-label="收起导航"
          className="grid size-7 place-items-center rounded-md text-[#7b827d] hover:bg-[#edf2ef] hover:text-[#202421]"
          type="button"
          onClick={() => onCollapsedChange(true)}
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
        <SidebarSection title="工作区">
          <SidebarButton
            active={workspaceRootActive}
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.root()}
          >
            <HomeIcon className="size-3.5 text-[#6f7d75]" />
            工作区
          </SidebarButton>
        </SidebarSection>

        <SidebarSection title="每日笔记">
          <div className="space-y-1 px-1">
            <div className="flex items-center gap-1">
              <SidebarButton
                aria-label="前一天"
                className="w-7 justify-center px-0"
                onClick={() => editor.getTransforms(TanaTimePlugin).time.previousDay()}
              >
                <ChevronLeftIcon className="size-3.5 text-[#6f7d75]" />
              </SidebarButton>
              <SidebarButton
                className="flex-1"
                onClick={() => editor.getTransforms(TanaTimePlugin).time.today()}
              >
                <CalendarDaysIcon className="size-3.5 text-[#4f725f]" />
                今天
              </SidebarButton>
              <SidebarButton
                aria-label="后一天"
                className="w-7 justify-center px-0"
                onClick={() => editor.getTransforms(TanaTimePlugin).time.nextDay()}
              >
                <ChevronRightIcon className="size-3.5 text-[#6f7d75]" />
              </SidebarButton>
            </div>
            <input
              aria-label="前往指定日期"
              className="h-7 w-full rounded border border-[#e1e7e3] bg-white px-2 text-xs text-[#39433d] outline-none focus:border-[#83a894] focus:ring-1 focus:ring-[#c3d7c8]"
              type="date"
              value={dayInput}
              onChange={(event) => setDayInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !dayInput) return;

                event.preventDefault();
                editor.getTransforms(TanaTimePlugin).time.goToDay(dayInput);
              }}
              onBlur={() => {
                if (dayInput) editor.getTransforms(TanaTimePlugin).time.goToDay(dayInput);
              }}
            />
          </div>
        </SidebarSection>

        <SidebarSection title="超级标签">
          {supertags.length === 0 ? (
            <p className="px-2 py-1 text-[#8b938d] text-xs">暂无超级标签</p>
          ) : (
            supertags.map((node) => (
              <SidebarButton
                key={node.id}
                active={activeNodeId === node.id}
                onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
              >
                <HashIcon className="size-3.5 shrink-0 text-[#4f725f]" />
                <span className="truncate">#{node.text || '未命名超级标签'}</span>
                <span className="ml-auto text-[#8b938d] text-[10px] tabular-nums">
                  {index.nodesBySupertag.get(node.id)?.length ?? 0}
                </span>
              </SidebarButton>
            ))
          )}
        </SidebarSection>

        <SidebarSection title="视图">
          {views.length === 0 ? (
            <p className="px-2 py-1 text-[#8b938d] text-xs">暂无视图</p>
          ) : (
            views.map((view) => (
              <SidebarButton
                key={view.id}
                active={activeNodeId === view.id}
                onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(view.id)}
              >
                <ListFilterIcon className="size-3.5 shrink-0 text-[#6f7d75]" />
                <span className="truncate">{view.text || '未命名视图'}</span>
              </SidebarButton>
            ))
          )}
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="mb-5">
      <h2 className="px-2 py-1.5 font-medium text-[#8b938d] text-[10px] uppercase tracking-[0.1em]">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function SidebarButton({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs hover:bg-[#edf2ef]',
        active && 'bg-[#e7efe9] font-medium text-[#2c604b]',
        className
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
