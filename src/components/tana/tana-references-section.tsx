'use client';

import { ArrowUpRightIcon, Link2Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  isTanaNodeActive,
  resolveTanaNodeTitle,
  type NodeId,
  type TanaIndex,
} from '@/lib/tana';

/** A derived navigation surface; backlink relations remain owned by TanaIndex. */
export function TanaReferencesSection({
  index,
  nodeId,
}: {
  index: TanaIndex;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const references = (index.backlinks.get(nodeId) ?? []).filter((reference) =>
    isTanaNodeActive(index, reference.sourceNodeId)
  );

  if (references.length === 0) return null;

  return (
    <section aria-label="引用此节点" className="mt-8 border-t pt-5">
      <h2 className="mb-2 flex items-center gap-2 font-medium text-sm text-[var(--tana-text-secondary)]">
        <Link2Icon aria-hidden="true" className="size-4 text-[var(--tana-reference)]" />
        引用 · {references.length}
      </h2>
      <div className="space-y-0.5">
        {references.map((reference, position) => {
          const source = index.nodesById.get(reference.sourceNodeId);
          const title = source
            ? resolveTanaNodeTitle(index, source.id)
            : '已删除的节点';

          return (
            <button
              key={`${reference.kind}-${reference.sourceNodeId}-${reference.path.join('.')}-${position}`}
              className="group flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left text-xs hover:bg-[var(--tana-hover)]"
              type="button"
              onClick={() =>
                editor.getTransforms(TanaZoomPlugin).zoom.to(reference.sourceNodeId)
              }
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--tana-reference)]" />
              <span className="min-w-0 flex-1 truncate">{title || '未命名节点'}</span>
              <span className="shrink-0 text-[var(--tana-text-tertiary)] text-[10px]">
                {reference.kind === 'inline' ? '行内' : '节点'}
              </span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-[var(--tana-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
