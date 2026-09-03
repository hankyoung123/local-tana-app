"use client";

import { ArrowLeftIcon, ListFilterIcon } from "lucide-react";
import { useEditorRef } from "platejs/react";

import type { TanaIndex, TanaNode } from "@/lib/tana";
import {
  createAndQuery,
  describeTanaQueryExpression,
  resolveTanaNodeTitle,
  runTanaQuery,
} from "@/lib/tana";
import { TanaZoomPlugin } from "@/components/editor/plugins/tana-zoom-plugin";
import { Button } from "@/components/ui/button";

import { NodeProjection } from "./node-projection";
import { TanaCalendarView } from "./tana-calendar-view";
import { TanaCardsView } from "./tana-cards-view";
import { TanaTableView } from "./tana-table-view";

export function TanaView({
  index,
  view,
}: {
  index: TanaIndex;
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const query = view.searchDefinition?.query ?? createAndQuery();
  const results = runTanaQuery(index, query).filter(({ id }) => id !== view.id);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="shrink-0 border-b px-6 py-5 sm:px-10">
        <div className="mb-3 flex items-center justify-between gap-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.out()}
          >
            <ArrowLeftIcon />
            返回上级
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {results.length} 条结果
          </span>
        </div>
        <p className="mb-1 text-muted-foreground text-xs">
          {view.viewDefinition?.type === "table"
            ? "表格视图"
            : view.viewDefinition?.type === "calendar"
              ? "日历视图"
              : view.viewDefinition?.type === "cards"
                ? "卡片视图"
                : "大纲视图"}
        </p>
        <h1 className="font-semibold text-2xl">
          {resolveTanaNodeTitle(index, view.id)}
        </h1>
        <div className="mt-3">
          <span className="inline-block rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
            {describeTanaQueryExpression(index, query)}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
        {results.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed text-center">
            <div>
              <ListFilterIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="font-medium text-sm">没有匹配的节点</p>
              <p className="mt-1 text-muted-foreground text-xs">
                请在检查器中编辑此搜索的筛选条件。
              </p>
            </div>
          </div>
        ) : view.viewDefinition?.type === "table" ? (
          <TanaTableView index={index} results={results} />
        ) : view.viewDefinition?.type === "calendar" ? (
          <TanaCalendarView index={index} results={results} />
        ) : view.viewDefinition?.type === "cards" ? (
          <TanaCardsView index={index} results={results} />
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
