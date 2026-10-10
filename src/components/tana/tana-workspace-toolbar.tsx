'use client';

import * as React from 'react';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EllipsisIcon,
  PanelRightIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { type PlateEditor, usePluginOption } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toolbar } from '@/components/ui/toolbar';
import { TanaShellControl } from './tana-shell-control';
import type { TanaNode, NodeId } from '@/lib/tana';
import { cn } from '@/lib/utils';

import type { TanaWorkspaceCommandId } from './tana-workspace-commands';
import type { PersistenceStatus } from './tana-workspace-types';
import type { TanaSidebarMode } from '@/lib/tana';

export function TanaWorkspaceToolbar({
  breadcrumbs,
  editor,
  fieldPanelOpen,
  focusedNodeId,
  onCommand,
  persistenceStatus,
  navigationExpanded,
  sidebarMode,
  focusMode,
}: {
  breadcrumbs: readonly TanaNode[];
  editor: PlateEditor;
  fieldPanelOpen: boolean;
  focusedNodeId: NodeId | null;
  onCommand: (command: TanaWorkspaceCommandId) => void;
  persistenceStatus: PersistenceStatus;
  navigationExpanded: boolean;
  sidebarMode: TanaSidebarMode;
  focusMode: boolean;
}) {
  const historyIndex = usePluginOption(TanaZoomPlugin, 'historyIndex') ?? 0;
  const historyLength = usePluginOption(TanaZoomPlugin, 'history')?.length ?? 1;
  const compactPathStart = Math.max(0, breadcrumbs.length - 2);
  const overflowBreadcrumbs = breadcrumbs.slice(0, compactPathStart);
  const navigationLabel = focusMode
    ? '退出专注模式'
    : sidebarMode === 'full'
      ? '收窄导航'
      : sidebarMode === 'mini'
        ? '隐藏导航'
        : '展开导航';
  const handleToolbarMouseDown = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"], [data-tauri-no-drag]')) return;
    void import('@tauri-apps/api/core').then(async ({ isTauri }) => {
      if (!isTauri()) return;
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    });
  }, []);

  return (
    <Toolbar aria-label="工作区工具栏" className="tana-commandbar" data-tauri-drag-region onMouseDown={handleToolbarMouseDown}>
      <div className="tana-commandbar-leading">
        <TanaShellControl
          label={navigationLabel}
          aria-controls="tana-sidebar"
          aria-expanded={focusMode ? false : navigationExpanded}
          aria-pressed={focusMode ? true : undefined}
          onClick={() => onCommand(focusMode ? 'toggle-focus-mode' : 'toggle-sidebar')}
        >
          <PanelLeftIcon className="size-3.5" />
        </TanaShellControl>
        {historyLength > 1 && (
          <span className="tana-commandbar-history flex">
            <TanaShellControl label="返回上一页" disabled={historyIndex <= 0} onClick={() => onCommand('navigate-back')}>
              <ArrowLeftIcon className="size-3.5" />
            </TanaShellControl>
            <TanaShellControl label="前进到下一页" disabled={historyIndex >= historyLength - 1} onClick={() => onCommand('navigate-forward')}>
              <ArrowRightIcon className="size-3.5" />
            </TanaShellControl>
          </span>
        )}
      </div>

      <nav
        aria-label="路径导航"
        className="tana-breadcrumbs"
      >
        <button
          className="truncate disabled:text-[var(--tana-text)]"
          disabled={!focusedNodeId}
          type="button"
          onClick={() => onCommand('navigate-root')}
        >
          个人知识库
        </button>
        {overflowBreadcrumbs.length > 0 && (
          <DropdownMenu>
            <span className="tana-breadcrumb-more-group">
              <span aria-hidden="true" className="tana-breadcrumb-separator text-[var(--tana-text-tertiary)]/60">
                /
              </span>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`显示 ${overflowBreadcrumbs.length} 个上级路径`}
                  className="tana-breadcrumb-more rounded-md px-1.5 py-1 text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
                  type="button"
                >
                  …
                </button>
              </DropdownMenuTrigger>
            </span>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel className="text-[11px] text-[var(--tana-text-tertiary)]">
                上级路径
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {overflowBreadcrumbs.map((node) => (
                <DropdownMenuItem
                  key={node.id}
                  onSelect={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
                >
                  <span className="max-w-56 truncate">{node.text || '未命名节点'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {breadcrumbs.map((node, breadcrumbIndex) => {
          const isCurrent = breadcrumbIndex === breadcrumbs.length - 1;
          const isOverflow = breadcrumbIndex < compactPathStart;

          return (
            <React.Fragment key={node.id}>
              <span
                aria-hidden="true"
                className={cn(
                  'tana-breadcrumb-separator text-[var(--tana-text-tertiary)]/60',
                  isOverflow && 'tana-breadcrumb-overflow',
                )}
              >
                /
              </span>
              {isCurrent ? (
                <span aria-current="page" className="tana-breadcrumb-current truncate font-medium text-[var(--tana-text)]">
                  {node.text || '未命名节点'}
                </span>
              ) : (
                <button
                  className={cn('truncate', isOverflow && 'tana-breadcrumb-overflow')}
                  type="button"
                  onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
                >
                  {node.text || '未命名节点'}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="tana-commandbar-actions">
        {persistenceStatus === 'saving' && <span className="tana-persistence-status" role="status">保存中…</span>}
        {persistenceStatus === 'error' && <span className="text-xs text-destructive" role="alert">保存失败</span>}
        <TanaShellControl label="打开全局搜索" shortcut="⌘ K" className="tana-toolbar-search" onClick={() => onCommand('search')}>
          <SearchIcon className="size-3.5" />
        </TanaShellControl>
        <TanaShellControl
          label={fieldPanelOpen ? '关闭配置面板' : '打开配置面板'}
          aria-pressed={fieldPanelOpen}
          onClick={() => onCommand('toggle-inspector')}
        >
          <PanelRightIcon className="size-3.5" />
        </TanaShellControl>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="更多页面操作" className="tana-shell-control" type="button">
              <EllipsisIcon className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={() => onCommand('quick-add')}>快速记录 <span className="ml-auto tana-keycap">⌘ E</span></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCommand('copy-link')}>复制链接</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCommand('open-command-palette')}>命令面板…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onCommand('toggle-focus-mode')}>{focusMode ? '退出' : '进入'}专注模式</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TanaShellControl label="新建节点" className="tana-commandbar-create" onClick={() => onCommand('new-node')}>
          <PlusIcon className="size-3.5" />
        </TanaShellControl>
      </div>
    </Toolbar>
  );
}
