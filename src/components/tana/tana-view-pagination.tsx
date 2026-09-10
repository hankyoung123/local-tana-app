'use client';

import { useEditorRef } from 'platejs/react';

import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import type { TanaNode, TanaViewProjection } from '@/lib/tana';

/** Persisted page selection controls a derived slice only; it never caches results. */
export function TanaViewPagination({ projection, view }: { projection: TanaViewProjection; view: TanaNode }) {
  const editor = useEditorRef();
  if (projection.pageCount <= 1) return null;
  const update = (page: number) => editor.getTransforms(TanaViewPlugin).view.update(view.id, {
    pagination: { ...view.viewDefinition?.pagination, page },
  });
  return (
    <nav aria-label="视图分页" className="mt-4 flex items-center justify-end gap-2 text-xs">
      <button className="rounded px-2 py-1 hover:bg-[var(--tana-hover)] disabled:opacity-40" disabled={projection.page === 0} type="button" onClick={() => update(projection.page - 1)}>上一页</button>
      <span>{projection.page + 1} / {projection.pageCount}</span>
      <button className="rounded px-2 py-1 hover:bg-[var(--tana-hover)] disabled:opacity-40" disabled={projection.page + 1 >= projection.pageCount} type="button" onClick={() => update(projection.page + 1)}>下一页</button>
    </nav>
  );
}
