'use client';

import type * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Shared shell control. Mouse actions preserve the existing Plate caret. */
export function TanaShellControl({
  children,
  className,
  label,
  shortcut,
  onMouseDown,
  ...props
}: React.ComponentProps<'button'> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn('tana-shell-control', className)}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onMouseDown?.(event);
          }}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}{shortcut && ` · ${shortcut}`}</TooltipContent>
    </Tooltip>
  );
}
