'use client';

import { useEditorRef } from 'platejs/react';

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
  const supertags = Array.from(index.nodesById.values()).filter(
    ({ supertagDefinition }) => !!supertagDefinition
  );
  const views = Array.from(index.nodesById.values()).filter(
    ({ viewDefinition }) => !!viewDefinition
  );

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 justify-center border-r border-[#e6ebe8] bg-[#fafbfa] pt-3">
        <button
          aria-label="展开导航"
          className="h-7 w-7 text-[#7b827d] text-sm hover:text-[#202421]"
          type="button"
          onClick={() => onCollapsedChange(false)}
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[#e6ebe8] bg-[#fafbfa]">
      <div className="flex h-11 items-center justify-between px-4">
        <span className="font-medium text-[13px]">导航</span>
        <button
          className="text-[#7b827d] text-xs hover:text-[#202421]"
          type="button"
          onClick={() => onCollapsedChange(true)}
        >
          收起
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
        <SidebarSection title="工作区">
          <SidebarButton
            active={workspaceRootActive}
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.root()}
          >
            工作区
          </SidebarButton>
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
