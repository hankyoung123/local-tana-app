'use client';

import * as React from 'react';

import { HashIcon, HomeIcon, ListFilterIcon, SearchIcon } from 'lucide-react';

import type { NodeId, TanaIndex } from '@/lib/tana';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type TanaSidebarProps = {
  activeNodeId: NodeId | null;
  index: TanaIndex;
  onNavigate: (nodeId: NodeId) => void;
  onOpenView: (nodeId: NodeId) => void;
  onWorkspaceRoot: () => void;
  workspaceRootActive: boolean;
};

export function TanaSidebar({
  activeNodeId,
  index,
  onNavigate,
  onOpenView,
  onWorkspaceRoot,
  workspaceRootActive,
}: TanaSidebarProps) {
  const [search, setSearch] = React.useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const results = normalizedSearch
    ? Array.from(index.nodesById.values())
        .filter(({ text }) =>
          text.toLocaleLowerCase().includes(normalizedSearch)
        )
        .slice(0, 20)
    : [];
  const supertags = Array.from(index.nodesById.values()).filter(
    ({ supertagDefinition }) => !!supertagDefinition
  );
  const views = Array.from(index.nodesById.values()).filter(
    ({ viewDefinition }) => !!viewDefinition
  );

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-[#e2e7e4] bg-[#f7f9f8] lg:flex">
      <div className="p-3">
        <label className="relative block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 bg-white pl-8 text-xs shadow-none"
            value={search}
            aria-label="搜索节点"
            placeholder="搜索节点"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {normalizedSearch ? (
          <SidebarSection title="搜索结果">
            {results.length === 0 ? (
              <p className="px-2 py-2 text-muted-foreground text-xs">
                没有匹配的节点
              </p>
            ) : (
              results.map((node) => (
                <SidebarButton
                  key={node.id}
                  onClick={() => onNavigate(node.id)}
                >
                  <SearchIcon />
                  <span className="truncate">{node.text}</span>
                </SidebarButton>
              ))
            )}
          </SidebarSection>
        ) : (
          <>
            <SidebarSection title="工作区">
              <SidebarButton
                active={workspaceRootActive}
                onClick={onWorkspaceRoot}
              >
                <HomeIcon />
                <span className="truncate">工作区</span>
              </SidebarButton>
            </SidebarSection>

            <SidebarSection title="超级标签">
              {supertags.length === 0 ? (
                <p className="px-2 py-2 text-muted-foreground text-xs">
                  选择一个节点以定义超级标签
                </p>
              ) : (
                supertags.map((node) => (
                  <SidebarButton
                    key={node.id}
                    active={activeNodeId === node.id}
                    onClick={() => onNavigate(node.id)}
                  >
                    <HashIcon />
                    <span className="truncate">{node.text}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      {index.nodesBySupertag.get(node.id)?.length ?? 0}
                    </span>
                  </SidebarButton>
                ))
              )}
            </SidebarSection>

            <SidebarSection title="视图">
              {views.length === 0 ? (
                <p className="px-2 py-2 text-muted-foreground text-xs">
                  将节点定义为视图
                </p>
              ) : (
                views.map((view) => (
                  <SidebarButton
                    key={view.id}
                    active={activeNodeId === view.id}
                    onClick={() => onOpenView(view.id)}
                  >
                    <ListFilterIcon />
                    <span className="truncate">{view.text}</span>
                  </SidebarButton>
                ))
              )}
            </SidebarSection>
          </>
        )}
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
      <h2 className="px-2 py-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
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
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-[#e9efec] [&_svg]:size-3.5 [&_svg]:shrink-0',
        active && 'bg-[#e6eee9] font-medium text-[#1f6f52]',
        className
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
