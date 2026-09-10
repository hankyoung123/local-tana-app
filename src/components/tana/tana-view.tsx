"use client";

import { resolveTanaCollectionSource, resolveTanaViewProjection, type TanaIndex, type TanaNode } from "@/lib/tana";
import { NodeProjection } from "./node-projection";
import { TanaCalendarToolbarControls, TanaCalendarView } from "./tana-calendar-view";
import { TanaCardsToolbarControls, TanaCardsView } from "./tana-cards-view";
import { TanaNavigationView } from "./tana-navigation-view";
import { TanaTableToolbarControls, TanaTableView } from "./tana-table-view";
import { TanaViewPagination } from "./tana-view-pagination";
import { TanaViewGroupControl } from "./tana-view-group-control";
import { TanaViewToolbar } from "./tana-view-toolbar";

/** Every renderer consumes this one source → filter → sort → display pipeline. */
export function TanaView({ index, view }: { index: TanaIndex; view: TanaNode }) {
  const source = resolveTanaCollectionSource(index, view);
  const projection = resolveTanaViewProjection(index, view, source.nodes);
  const results = projection.items.map(({ occurrence }) => occurrence);
  const viewType = view.viewDefinition?.type ?? "outline";

  return (
    <section className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[var(--tana-canvas)]">
      <TanaViewToolbar
        controls={
          viewType === "table" ? <TanaTableToolbarControls index={index} results={results} view={view} /> :
          viewType === "calendar" ? <TanaCalendarToolbarControls index={index} results={results} view={view} /> :
          viewType === "cards" ? <><TanaCardsToolbarControls index={index} results={results} view={view} /></> :
          viewType === "outline" ? <TanaViewGroupControl index={index} results={results} view={view} /> : undefined
        }
        index={index}
        results={source.nodes}
        view={view}
      />
      <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 sm:px-10">
        {results.length === 0 && viewType !== "table" ? <p className="py-8 text-[var(--tana-text-tertiary)] text-sm">暂无匹配节点</p> :
          viewType === "table" ? <TanaTableView index={index} projection={projection} results={results} view={view} /> :
          viewType === "calendar" ? <TanaCalendarView index={index} projection={projection} results={results} view={view} /> :
          viewType === "cards" ? <TanaCardsView index={index} projection={projection} results={results} view={view} /> :
          viewType === "list" || viewType === "tabs" || viewType === "side-menu" ? <TanaNavigationView index={index} projection={projection} type={viewType} /> :
          <div className="mx-auto max-w-3xl space-y-3">
            {projection.groups.map((group) => (
              <section key={group.key}>
                {view.viewDefinition?.groupFieldId && <h2 className="px-1 py-1 text-xs font-medium text-[var(--tana-text-tertiary)]">{group.label} · {group.items.length}</h2>}
                {group.items.map(({ occurrence }) => <NodeProjection key={occurrence.id} fieldIds={projection.visibleFieldIds} index={index} targetNodeId={occurrence.id} variant="search-result" />)}
              </section>
            ))}
          </div>}
        <TanaViewPagination projection={projection} view={view} />
      </div>
    </section>
  );
}
