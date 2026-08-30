'use client';

import { ArrowLeftIcon, ArrowUpRightIcon, ListFilterIcon } from 'lucide-react';

import type { NodeId, TanaIndex, TanaNode } from '@/lib/tana';
import {
  describeTanaQueryClause,
  getNodeSupertagIds,
  runTanaQuery,
} from '@/lib/tana';
import { Button } from '@/components/ui/button';

export function TanaView({
  index,
  onBack,
  onNavigate,
  view,
}: {
  index: TanaIndex;
  onBack: () => void;
  onNavigate: (nodeId: NodeId) => void;
  view: TanaNode;
}) {
  const clauses = view.viewDefinition?.clauses ?? [];
  const results = runTanaQuery(index, clauses).filter(
    ({ id }) => id !== view.id
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="shrink-0 border-b px-6 py-5 sm:px-10">
        <div className="mb-3 flex items-center justify-between gap-4">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeftIcon />
            返回编辑器
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {results.length} 条结果
          </span>
        </div>
        <p className="mb-1 text-muted-foreground text-xs">视图</p>
        <h1 className="font-semibold text-2xl">{view.text}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {clauses.length === 0 ? (
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-800 text-xs">
              未设置筛选条件：显示所有节点
            </span>
          ) : (
            clauses.map((clause, indexInList) => (
              <span
                key={`${clause.kind}:${indexInList}`}
                className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs"
              >
                {describeTanaQueryClause(index, clause)}
              </span>
            ))
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {results.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <ListFilterIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="font-medium text-sm">没有匹配的节点</p>
              <p className="mt-1 text-muted-foreground text-xs">
                请在检查器中编辑此视图的筛选条件。
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl divide-y rounded-lg border">
            {results.map((node) => {
              const supertagIds = getNodeSupertagIds(index, node.id);

              return (
                <button
                  key={node.id}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
                  type="button"
                  onClick={() => onNavigate(node.id)}
                >
                  <ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{node.text}</span>
                    {supertagIds.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {supertagIds.map((supertagId) => (
                          <span
                            key={supertagId}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800"
                          >
                            #{index.nodesById.get(supertagId)?.text ?? supertagId}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
