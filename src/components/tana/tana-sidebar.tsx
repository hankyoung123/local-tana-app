'use client';

import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HashIcon,
  HomeIcon,
  SearchIcon,
} from 'lucide-react';
import * as React from 'react';
import { useEditorRef } from 'platejs/react';

import { TanaTimePlugin } from '@/components/editor/plugins/tana-time-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  getActiveSupertagInstances,
  isTanaNodeActive,
  type NodeId,
  type TanaIndex,
} from '@/lib/tana';
import { cn } from '@/lib/utils';

type TanaSidebarProps = {
  activeNodeId: NodeId | null;
  collapsed: boolean;
  index: TanaIndex;
  onCollapsedChange: (collapsed: boolean) => void;
  onOpenSearch: () => void;
};

/** Quiet text navigation. Search opens the shared Command popup. */
export function TanaSidebar({
  activeNodeId,
  collapsed,
  index,
  onCollapsedChange,
  onOpenSearch,
}: TanaSidebarProps) {
  const editor = useEditorRef();
  const supertags = Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes('supertag-definition')
  );
  const homeNodeId = index.systemNodeIds.get('home');

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 justify-center border-r border-[var(--tana-divider)] bg-[var(--tana-sidebar)] pt-3">
        <button
          aria-label="展开导航"
          className="grid size-7 place-items-center rounded-md text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
          type="button"
          onClick={() => onCollapsedChange(false)}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-40 shrink-0 lg:w-48 xl:w-56 flex-col border-r border-[var(--tana-divider)] bg-[var(--tana-sidebar)]">
      <div className="flex h-12 items-center justify-between px-4">
        <span className="flex items-center gap-2 font-medium text-[13px] text-[var(--tana-text)]">
          <span className="grid size-5 place-items-center rounded-md bg-[var(--tana-accent)] font-semibold text-white text-[10px]">
            T
          </span>
          Local Tana
        </span>
        <button
          aria-label="收起导航"
          className="grid size-7 place-items-center rounded-md text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
          type="button"
          onClick={() => onCollapsedChange(true)}
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
        <nav aria-label="主导航" className="space-y-0.5">
          <SidebarButton
            onClick={() => editor.getTransforms(TanaTimePlugin).time.today()}
          >
            <CalendarDaysIcon className="size-3.5 text-[var(--tana-accent)]" />
            Today
          </SidebarButton>
          <SidebarButton onClick={onOpenSearch}>
            <SearchIcon className="size-3.5 shrink-0 text-[var(--tana-accent)]" />
            Search
            <span className="ml-auto text-[var(--tana-text-tertiary)] text-[10px]">⌘ P</span>
          </SidebarButton>
        </nav>

        <SidebarSection title="Supertags">
          {supertags.length === 0 ? (
            <p className="px-2 py-1 text-[var(--tana-text-tertiary)] text-xs">暂无超级标签</p>
          ) : (
            supertags.map((node) => (
              <SidebarButton
                key={node.id}
                active={activeNodeId === node.id}
                onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
              >
                <HashIcon className="size-3.5 shrink-0 text-[var(--tana-accent)]" />
                <span className="truncate">#{node.text || '未命名超级标签'}</span>
                <span className="ml-auto text-[var(--tana-text-tertiary)] text-[10px] tabular-nums">
                  {getActiveSupertagInstances(index, node.id).length}
                </span>
              </SidebarButton>
            ))
          )}
        </SidebarSection>

        <SidebarSection title="Workspace">
          <SidebarButton
            active={activeNodeId === homeNodeId}
            onClick={() =>
              homeNodeId
                ? editor.getTransforms(TanaZoomPlugin).zoom.to(homeNodeId)
                : editor.getTransforms(TanaZoomPlugin).zoom.root()
            }
          >
            <HomeIcon className="size-3.5 text-[var(--tana-text-secondary)]" />
            Home
          </SidebarButton>
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
    <section className="mt-5">
      <h2 className="px-2 py-1.5 font-medium text-[var(--tana-text-tertiary)] text-[11px]">
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
        'flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]',
        active && 'bg-[var(--tana-selected)] font-medium text-[var(--tana-accent)]',
        className
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
