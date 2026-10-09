'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

type TanaPanelResizerProps = {
  'aria-label': string;
  direction: 1 | -1;
  onResize: (delta: number) => void;
  className?: string;
};

/**
 * Presentation-only splitter for shell panels. It never touches the Plate
 * document, selection, or workspace metadata.
 */
export function TanaPanelResizer({
  'aria-label': ariaLabel,
  className,
  direction,
  onResize,
}: TanaPanelResizerProps) {
  const pointerId = React.useRef<number | null>(null);
  const lastX = React.useRef<number | null>(null);
  const listeners = React.useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    cancel: () => void;
  } | null>(null);

  const detach = React.useCallback(() => {
    const current = listeners.current;
    if (!current) return;
    window.removeEventListener('pointermove', current.move);
    window.removeEventListener('pointerup', current.up);
    window.removeEventListener('pointercancel', current.cancel);
    listeners.current = null;
  }, []);

  const finish = React.useCallback(() => {
    detach();
    pointerId.current = null;
    lastX.current = null;
  }, [detach]);

  React.useEffect(() => finish, [finish]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId.current = event.pointerId;
    lastX.current = event.clientX;

    const move = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId.current || lastX.current === null) return;
      const delta = (nativeEvent.clientX - lastX.current) * direction;
      lastX.current = nativeEvent.clientX;
      if (delta !== 0) onResize(delta);
    };
    const up = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId === pointerId.current) finish();
    };
    const cancel = () => finish();
    listeners.current = { move, up, cancel };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onResize(-step * direction);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(step * direction);
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="vertical"
      className={cn('tana-panel-resizer', className)}
      role="separator"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    />
  );
}
