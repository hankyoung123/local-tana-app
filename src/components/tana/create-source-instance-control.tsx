'use client';

import * as React from 'react';

import { PlusIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NodeId } from '@/lib/tana';

/**
 * Creates a canonical source Supertag instance from a From-Supertag field and
 * assigns it through the existing Plate writer. The control is presentation
 * only; the new instance still lives under Home and keeps its NodeId.
 */
export function CreateSourceInstanceControl({
  fieldId,
  nodeId,
  sourceSupertagId,
}: {
  fieldId: NodeId;
  nodeId: NodeId;
  sourceSupertagId: NodeId;
}) {
  const editor = useEditorRef();
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [open, setOpen] = React.useState(false);

  const create = () => {
    const title = name.trim();
    if (!title) return;

    const created = editor
      .getTransforms(TanaSupertagPlugin)
      .supertag.createSourceInstanceAndAssign(nodeId, fieldId, sourceSupertagId, title);

    if (!created) {
      setError('创建失败，请检查来源标签是否仍然可用。');
      return;
    }

    setName('');
    setError(undefined);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setError(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label="新建来源标签实例"
          className="tana-shell-control"
          data-plate-prevent-deselect
          title="新建来源标签实例"
          type="button"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <label className="mb-2 block text-xs text-muted-foreground" htmlFor={`new-source-instance-${nodeId}-${fieldId}`}>
          新建来源标签实例
        </label>
        <div className="flex items-center gap-2">
          <input
            aria-label="来源实例标题"
            autoFocus
            className="tana-control-field min-w-0 flex-1 px-2"
            data-plate-prevent-deselect
            id={`new-source-instance-${nodeId}-${fieldId}`}
            placeholder="输入标题…"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                create();
              }
            }}
          />
          <button
            aria-label="创建来源标签实例"
            className="shrink-0 rounded px-2 py-1.5 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)] disabled:opacity-50"
            data-plate-prevent-deselect
            disabled={name.trim().length === 0}
            type="button"
            onClick={create}
          >
            创建
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] text-destructive" role="status">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
