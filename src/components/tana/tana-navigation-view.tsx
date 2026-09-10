'use client';

import { useEditorRef } from 'platejs/react';

import { resolveTanaNodeTitle, type TanaIndex, type TanaViewProjection } from '@/lib/tana';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';

/** Navigation View types consume the same projection; they only choose chrome. */
export function TanaNavigationView({
  index,
  projection,
  type,
}: {
  index: TanaIndex;
  projection: TanaViewProjection;
  type: 'list' | 'side-menu' | 'tabs';
}) {
  const editor = useEditorRef();
  const navigationClass = type === 'tabs'
    ? 'flex flex-wrap gap-1 border-b border-[var(--tana-divider)] pb-2'
    : type === 'side-menu'
      ? 'max-w-64 space-y-1 rounded-md border p-2'
      : 'space-y-1';

  return (
    <nav aria-label="视图导航" className={navigationClass}>
      {projection.items.map(({ occurrence, target }) => (
        <button
          aria-label={`打开 ${resolveTanaNodeTitle(index, target.id) || '未命名节点'}`}
          className="block rounded px-2 py-1 text-left text-sm hover:bg-[var(--tana-hover)]"
          key={occurrence.id}
          type="button"
          onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(target.id)}
        >
          {resolveTanaNodeTitle(index, target.id) || '未命名节点'}
        </button>
      ))}
    </nav>
  );
}
