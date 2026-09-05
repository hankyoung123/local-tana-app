"use client";

import type { TanaIndex, TanaNode } from "@/lib/tana";
import { resolveTanaCollectionSource } from "@/lib/tana";
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

  return (
    <section className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[var(--tana-canvas)]">
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
        view={view}
      />

      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 sm:px-10">
        {results.length === 0 && viewType !== "table" ? (
          <p className="py-8 text-[var(--tana-text-tertiary)] text-sm">暂无匹配节点</p>
        ) : viewType === "table" ? (
          <TanaTableView index={index} results={results} view={view} />
        ) : viewType === "calendar" ? (
          <TanaCalendarView index={index} results={results} view={view} />
        ) : viewType === "cards" ? (
          <TanaCardsView index={index} results={results} view={view} />
        ) : (
          <div className="mx-auto max-w-3xl">
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
