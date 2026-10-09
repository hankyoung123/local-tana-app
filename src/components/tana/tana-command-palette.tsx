'use client';

import * as React from 'react';

import { CornerDownLeftIcon, SearchIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import {
  TANA_COMMAND_PALETTE_GROUPS,
  type TanaWorkspaceCommandId,
} from './tana-workspace-commands';

export function TanaCommandPalette({
  onCommand,
  onOpenChange,
  open,
}: {
  onCommand: (command: TanaWorkspaceCommandId) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>命令面板</DialogTitle>
        <DialogDescription>搜索并执行工作区命令。</DialogDescription>
        <Command>
          <div className="mb-1 flex items-center gap-2 px-2 text-[var(--tana-text-tertiary)] text-[10px] uppercase tracking-[0.1em]">
            <SearchIcon className="size-3" />
            命令
          </div>
          <CommandInput autoFocus aria-label="搜索命令" placeholder="输入命令名称" />
          <CommandList className="mt-2 max-h-[min(28rem,60vh)]">
            <CommandEmpty>没有匹配的命令</CommandEmpty>
            {TANA_COMMAND_PALETTE_GROUPS.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    className="group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs"
                    value={`${item.label} ${item.shortcut}`}
                    onSelect={() => {
                      onOpenChange(false);
                      onCommand(item.id);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="tana-keycap shrink-0">{item.shortcut}</kbd>
                    )}
                    <CornerDownLeftIcon className="size-3 shrink-0 text-[var(--tana-text-tertiary)] opacity-0 group-data-[selected=true]:opacity-100" />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="mt-1 flex items-center justify-between border-t border-[var(--tana-divider)] px-2 pt-2 text-[var(--tana-text-tertiary)] text-[10px]">
            <span>↑↓ 选择 · Enter 执行</span>
            <span>Esc 关闭</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
