'use client';

import type { TanaIndex, TanaNode } from '@/lib/tana';

import { NodeProjection } from './node-projection';

/** Cards are only a responsive presentation of canonical Node projections. */
export function TanaCardsView({
  index,
  results,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {results.map((node) => (
        <article key={node.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <NodeProjection index={index} targetNodeId={node.id} variant="search-result" />
        </article>
      ))}
    </div>
  );
}
