"use client";

import { ListFilterIcon } from "lucide-react";

import type { TanaIndex, TanaNode } from "@/lib/tana";
import {
  describeTanaQueryExpression,
  resolveTanaCollectionSource,
} from "@/lib/tana";
import { NodeProjection } from "./node-projection";
import {
  TanaCalendarToolbarControls,
  TanaCalendarView,
} from "./tana-calendar-view";
import { TanaCardsToolbarControls, TanaCardsView } from "./tana-cards-view";
import { TanaTableToolbarControls, TanaTableView } from "./tana-table-view";
import { TanaViewToolbar } from "./tana-view-toolbar";

export function TanaView({
  index,
  view,
}: {
  index: TanaIndex;
  view: TanaNode;
}) {
  const source = resolveTanaCollectionSource(index, view);
  const results = source.nodes;
  const viewType = view.viewDefinition?.type ?? "outline";
  const sourceDescription =
    source.kind === "search"
      ? describeTanaQueryExpression(index, view.searchDefinition!.query)
      : source.kind === "supertag-instances"
        ? `#${view.text || "未命名超级标签"} 的实例`
        : "直接正文子节点";
  const emptyMessage =
    source.kind === "search"
      ? "请在检查器中编辑此搜索的筛选条件。"
      : source.kind === "supertag-instances"
        ? "暂无超级标签实例。"
        : "此视图还没有普通正文子节点。";

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <TanaViewToolbar
        controls={
          viewType === "table" ? (
            <TanaTableToolbarControls index={index} results={results} view={view} />
          ) : viewType === "calendar" ? (
            <TanaCalendarToolbarControls index={index} results={results} view={view} />
          ) : viewType === "cards" ? (
            <TanaCardsToolbarControls index={index} results={results} view={view} />
          ) : undefined
        }
        index={index}
        resultCount={results.length}
        sourceDescription={sourceDescription}
        view={view}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {results.length === 0 && viewType !== "table" ? (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <ListFilterIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="font-medium text-sm">没有匹配的节点</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {emptyMessage}
              </p>
            </div>
          </div>
        ) : viewType === "table" ? (
          <TanaTableView index={index} results={results} view={view} />
        ) : viewType === "calendar" ? (
          <TanaCalendarView index={index} results={results} view={view} />
        ) : viewType === "cards" ? (
          <TanaCardsView index={index} results={results} view={view} />
        ) : (
          <div className="mx-auto max-w-3xl divide-y rounded-lg border">
            {results.map((node) => (
              <NodeProjection
                key={node.id}
                index={index}
                targetNodeId={node.id}
                variant="search-result"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
