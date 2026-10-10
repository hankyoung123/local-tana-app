"use client";

import { getTanaViewState, resolveTanaCollectionSource, resolveTanaViewProjection, type TanaIndex, type TanaNode } from "@/lib/tana";
import { NodeProjection } from "./node-projection";
import { TanaCalendarToolbarControls, TanaCalendarView } from "./tana-calendar-view";
import { TanaCardsToolbarControls, TanaCardsView } from "./tana-cards-view";
import { TanaNavigationView } from "./tana-navigation-view";
import { TanaTableToolbarControls, TanaTableView } from "./tana-table-view";
import { TanaViewPagination } from "./tana-view-pagination";
import { TanaViewGroupControl } from "./tana-view-group-control";
import { TanaViewSortControls } from "./tana-view-sort-controls";
import { TanaViewDisplayFieldsControl } from "./tana-view-display-fields-control";
import { TanaViewToolbar } from "./tana-view-toolbar";

/** Every renderer consumes this one source → filter → sort → display pipeline. */
export function TanaView({ index, view }: { index: TanaIndex; view: TanaNode }) {
  const source = resolveTanaCollectionSource(index, view);
  const projection = resolveTanaViewProjection(index, view, source.nodes);
  const results = projection.items.map(({ occurrence }) => occurrence);
  const viewType = view.viewDefinition?.type ?? "outline";
  const state = getTanaViewState(view.viewDefinition);

  return (
    <section className="tana-view-surface flex min-w-0 max-w-full flex-1 flex-col overflow-hidden">
      <TanaViewToolbar
        controls={
          viewType === "table" ? <><TanaViewSortControls index={index} results={source.nodes} view={view} /><TanaTableToolbarControls index={index} results={results} view={view} /></> :
          viewType === "calendar" ? <TanaCalendarToolbarControls index={index} results={results} view={view} /> :
          viewType === "cards" ? <><TanaViewSortControls index={index} results={source.nodes} view={view} /><TanaCardsToolbarControls index={index} results={results} view={view} /></> :
          viewType === "outline" ? <><TanaViewSortControls index={index} results={source.nodes} view={view} /><TanaViewDisplayFieldsControl index={index} results={source.nodes} view={view} /><TanaViewGroupControl index={index} results={results} view={view} /></> : undefined
        }
        index={index}
        results={source.nodes}
        view={view}
      />
      <div className="tana-view-content min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto">
        {source.status === 'too-many-results' ? <div className="tana-validation-warning p-4 text-sm" role="status">结果超过 2500 条，请缩小查询范围后再运行。</div> :
          source.status === 'broken' ? <div className="tana-validation-warning p-4 text-sm" role="status">搜索条件已失效，请修复查询定义后再运行。</div> :
          projection.diagnostics.length > 0 ? <div className="tana-validation-warning p-4 text-sm" role="status">视图筛选条件已失效，请检查已删除的字段或超级标签。</div> :
          results.length === 0 && viewType !== "table" ? <div className="tana-empty-state text-sm">暂无匹配节点</div> :
          viewType === "table" ? <TanaTableView index={index} projection={projection} results={results} view={view} /> :
          viewType === "calendar" ? <TanaCalendarView index={index} projection={projection} results={results} view={view} /> :
          viewType === "cards" ? <TanaCardsView index={index} projection={projection} results={results} view={view} /> :
          viewType === "list" || viewType === "tabs" || viewType === "side-menu" ? <TanaNavigationView index={index} projection={projection} type={viewType} /> :
          <div className="mx-auto max-w-4xl space-y-3">
            {projection.groups.map((group) => (
              <section key={group.key}>
                {state.groupFieldId && <h2 className="px-1 py-1 text-xs font-medium text-[var(--tana-text-tertiary)]">{group.label} · {group.total}</h2>}
                {group.items.map(({ occurrence }) => <NodeProjection key={occurrence.id} fieldIds={projection.visibleFieldIds} index={index} targetNodeId={occurrence.id} variant="search-result" />)}
              </section>
            ))}
          </div>}
        <TanaViewPagination projection={projection} view={view} />
      </div>
    </section>
  );
}
