'use client';

import * as React from 'react';
import { HashIcon, PlusIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getSupertagCandidatesFromIndex, type NodeId, type TanaIndex } from '@/lib/tana';

/** One tag editor shared by outline and every derived projection. */
export function TanaSupertagControl({
  index,
  targetNodeId,
  assignedIds,
}: {
  index: TanaIndex;
  targetNodeId: NodeId;
  assignedIds: readonly NodeId[];
}) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim();
  const assigned = new Set(assignedIds);
  const candidates = getSupertagCandidatesFromIndex(index).filter(
    (candidate) => !assigned.has(candidate.id)
  );
  const filtered = candidates.filter((candidate) =>
    candidate.text.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
  );
  const exact = candidates.some(
    (candidate) => candidate.text.localeCompare(normalizedQuery, undefined, { sensitivity: 'accent' }) === 0
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const apply = (supertagId: NodeId) => {
    editor.getTransforms(TanaSupertagPlugin).supertag.apply(targetNodeId, supertagId);
    close();
  };

  const create = () => {
    if (!normalizedQuery || exact) return;
    editor.getTransforms(TanaSupertagPlugin).supertag.createAndApply(targetNodeId, normalizedQuery);
    close();
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setQuery('');
    }}>
      <PopoverTrigger asChild>
        <button
          aria-label="添加超级标签"
          className="inline-flex items-center gap-0.5 rounded-sm px-1 text-[10px] text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-accent-soft)] hover:text-[var(--tana-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tana-accent)]"
          type="button"
          onClick={(event) => event.stopPropagation()}
        >
          <PlusIcon aria-hidden="true" className="size-3" />
          添加标签
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" onOpenAutoFocus={(event) => event.preventDefault()}>
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="搜索超级标签"
            placeholder="搜索或创建标签…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>没有可用标签</CommandEmpty>
            {normalizedQuery && !exact && (
              <CommandGroup heading="创建">
                <CommandItem value={`create:${normalizedQuery}`} onSelect={create}>
                  <PlusIcon className="text-[var(--tana-accent)]" />
                  创建 #{normalizedQuery}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="已有标签">
              {filtered.map((candidate) => (
                <CommandItem key={candidate.id} value={candidate.id} onSelect={() => apply(candidate.id)}>
                  <HashIcon className="text-[var(--tana-accent)]" />
                  <span className="truncate">{candidate.text || '未命名标签'}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
