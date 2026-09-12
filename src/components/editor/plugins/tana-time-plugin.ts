import { ElementApi } from "platejs";
import { nanoid } from "platejs";
import type { Path } from "platejs";
import { createPlatePlugin, type PlateEditor } from "platejs/react";
import { isTanaNodeElement } from "@/lib/tana/constants";
import {
  addTanaDays,
  formatTanaDateValue,
  getTanaDayTime,
  getTanaDateGranularity,
  getTanaToday,
  getTanaTimeNodeId,
  getTanaWeekForDay,
  getTanaWeekStart,
  getTanaWeekTime,
  getTanaYearTime,
  isTanaDateValue,
  isTanaDay,
  isTanaMonth,
  isTanaWeek,
  isTanaYear,
  parseTanaDateValue,
} from "@/lib/tana/time";
import { buildTanaIndex, isTanaNodeInTrash } from "@/lib/tana/index";
import {
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
} from "@/lib/tana/outliner";
import type { NodeId, TanaBlockElement, TanaTime } from "@/lib/tana/types";
import { TanaZoomPlugin } from "./tana-zoom-plugin";
import { TanaNodeLifecyclePlugin } from "./tana-node-lifecycle-plugin";

export const TANA_TIME_PLUGIN_KEY = "tanaTime" as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });
  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, Path])
    : undefined;
}
function getDailyNotesEntry(editor: PlateEditor) {
  const id = buildTanaIndex(editor.children).systemNodeIds.get("daily-notes");
  return id ? getTanaNodeEntry(editor, id) : undefined;
}
function getWorkspaceTimeZone(editor: PlateEditor): string {
  const index = buildTanaIndex(editor.children);
  const id = index.systemNodeIds.get("workspace");
  const zone = id
    ? (index.nodesById.get(id)?.node as TanaBlockElement | undefined)
        ?.tanaWorkspaceTimeZone
    : undefined;
  return typeof zone === "string" && zone.length > 0 ? zone : "UTC";
}
function getInsertionPath(editor: PlateEditor, parentPath: Path): Path {
  const paths = getTanaNodeDescendantPaths(editor.children, parentPath);
  return [(paths.at(-1)?.[0] ?? parentPath[0]) + 1];
}

/** Keep sibling Calendar Nodes in their canonical ISO identity order. */
function getCalendarInsertionPath(
  editor: PlateEditor,
  parentPath: Path,
  time: TanaTime,
): Path {
  const childPaths = getTanaDirectChildPaths(editor.children, parentPath);
  const next = childPaths.find((path) => {
    const child = editor.api.node<TanaBlockElement>(path)?.[0];
    return child?.tanaTime?.unit === time.unit && child.tanaTime.value > time.value;
  });
  return next ? [next[0]] : getInsertionPath(editor, parentPath);
}

/** Rebase an existing Calendar subtree while preserving every relative indent. */
function rebaseCalendarSubtree(
  editor: PlateEditor,
  nodeId: NodeId,
  targetIndent: number,
): boolean {
  const entry = getTanaNodeEntry(editor, nodeId);
  if (!entry) return false;

  const sourceIndent = typeof entry[0].indent === "number" ? entry[0].indent : 0;
  const paths = [entry[1], ...getTanaNodeDescendantPaths(editor.children, entry[1])];
  paths.forEach((path) => {
    const current = editor.api.node<TanaBlockElement>(path)?.[0];
    if (!current) return;
    const indent = typeof current.indent === "number" ? current.indent : sourceIndent;
    editor.tf.setNodes(
      { indent: targetIndent + indent - sourceIndent },
      { at: path },
    );
  });

  return true;
}

function ensureCalendarNode(
  editor: PlateEditor,
  time: TanaTime,
  parentId: NodeId,
  parentIndent: number,
): NodeId | undefined {
  const index = buildTanaIndex(editor.children);
  const existing = getTanaTimeNodeId(index.timeNodeIds, time);
  if (existing) {
    if (
      isTanaNodeInTrash(index, existing) &&
      !editor
        .getTransforms(TanaNodeLifecyclePlugin)
        .node.restore(existing, "daily-notes")
    )
      return;
    const entry = getTanaNodeEntry(editor, existing);
    const parent = getTanaNodeEntry(editor, parentId);
    if (entry && parent) {
      const currentParent = buildTanaIndex(editor.children).parentNodeIds.get(existing);
      if (currentParent !== parentId) {
        const subtreePaths = [entry[1], ...getTanaNodeDescendantPaths(editor.children, entry[1])];
        const subtreeIds = new Set(
          subtreePaths.flatMap((path) => {
            const node = editor.api.node<TanaBlockElement>(path)?.[0];
            return node?.id ? [node.id] : [];
          }),
        );
        if (subtreeIds.has(parentId)) return;
        const targetIndex = getCalendarInsertionPath(editor, parent[1], time)[0];
        const targetPath = [
          targetIndex - subtreePaths.filter((path) => path[0] < targetIndex).length,
        ] as Path;
        const nodes = subtreePaths.flatMap((path) => {
          const node = editor.api.node<TanaBlockElement>(path)?.[0];
          return node ? [node] : [];
        });
        if (
          nodes.length !== subtreePaths.length ||
          !editor.getTransforms(TanaNodeLifecyclePlugin).node.relocateSubtreesRaw(
            nodes,
            subtreePaths,
            targetPath,
          )
        ) return;
      }
      rebaseCalendarSubtree(editor, existing, parentIndent + 1);
    }
    return existing;
  }
  const parent = getTanaNodeEntry(editor, parentId);
  if (!parent) return;
  const insertionPath = getCalendarInsertionPath(editor, parent[1], time);
  const newId = nanoid();
  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: formatTanaDateValue(time.value) }],
      id: newId,
      indent: parentIndent + 1,
      tanaTime: time,
    }),
    { at: insertionPath },
  );
  const createdEntry = getTanaNodeEntry(editor, newId);
  if (!createdEntry) return;
  const currentIndex = buildTanaIndex(editor.children);
  if (currentIndex.parentNodeIds.get(newId) !== parentId) {
    editor.getTransforms(TanaNodeLifecyclePlugin).node.relocateSubtreesRaw(
      [createdEntry[0]], [createdEntry[1]], getCalendarInsertionPath(editor, parent[1], time)
    );
  }
  const moved = getTanaNodeEntry(editor, newId);
  if (moved) rebaseCalendarSubtree(editor, newId, parentIndent + 1);
  return newId;
}
function goToDay(editor: PlateEditor, day: string): NodeId | undefined {
  if (!isTanaDay(day)) return;
  const daily = getDailyNotesEntry(editor);
  if (!daily) return;
  const dailyIndent = typeof daily[0].indent === "number" ? daily[0].indent : 0;
  let dayId: NodeId | undefined;
  editor.tf.withNewBatch(() => {
    // An ISO week belongs to its ISO week-year. Keeping the Year parent
    // derived from the Week identity makes dates around New Year stable:
    // 2021-01-01 is always under 2020-W53 → Year 2020, regardless of which
    // navigation entry created the hierarchy first.
    const week = getTanaWeekForDay(day);
    const yearId = ensureCalendarNode(editor, getTanaYearTime(week.slice(0, 4) as `${number}`), daily[0].id as NodeId, dailyIndent);
    if (!yearId) return;
    const year = getTanaNodeEntry(editor, yearId);
    const yearIndent = typeof year?.[0].indent === "number" ? year[0].indent : dailyIndent + 1;
    const weekId = ensureCalendarNode(editor, getTanaWeekTime(week), yearId, yearIndent);
    if (!weekId) return;
    const weekEntry = getTanaNodeEntry(editor, weekId);
    const weekIndent = typeof weekEntry?.[0].indent === "number" ? weekEntry[0].indent : yearIndent + 1;
    dayId = ensureCalendarNode(editor, getTanaDayTime(day), weekId, weekIndent);
  });
  return dayId && editor.getTransforms(TanaZoomPlugin).zoom.to(dayId)
    ? dayId
    : undefined;
}
function focusedCalendarDay(editor: PlateEditor): string | undefined {
  const id = editor.getOption(TanaZoomPlugin, "focusedNodeId");
  const node =
    typeof id === "string" ? getTanaNodeEntry(editor, id)?.[0] : undefined;
  if (!node?.tanaTime || !isTanaDateValue(node.tanaTime.value)) return;
  if (node.tanaTime.unit === "day" && isTanaDay(node.tanaTime.value))
    return node.tanaTime.value;
  if (
    node.tanaTime.unit === "month" &&
    /^\d{4}-\d{2}$/.test(node.tanaTime.value)
  )
    return `${node.tanaTime.value}-01`;
  if (node.tanaTime.unit === "year" && /^\d{4}$/.test(node.tanaTime.value))
    return `${node.tanaTime.value}-01-01`;
  if (node.tanaTime.unit === "week" && isTanaWeek(node.tanaTime.value)) {
    const interval = parseTanaDateValue(node.tanaTime.value);
    const start = interval?.start.toISOString().slice(0, 10);
    return start && isTanaDay(start) ? getTanaWeekStart(start) : undefined;
  }
  return undefined;
}

function focusedCalendarTime(editor: PlateEditor): TanaTime | undefined {
  const id = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
  const node = typeof id === 'string' ? getTanaNodeEntry(editor, id)?.[0] : undefined;
  return node?.tanaTime && isTanaDateValue(node.tanaTime.value) ? node.tanaTime : undefined;
}

function goToSimpleCalendarNode(editor: PlateEditor, time: TanaTime): NodeId | undefined {
  const daily = getDailyNotesEntry(editor);
  if (!daily) return;
  const indent = typeof daily[0].indent === 'number' ? daily[0].indent : 0;
  let id: NodeId | undefined;
  editor.tf.withNewBatch(() => { id = ensureCalendarNode(editor, time, daily[0].id as NodeId, indent); });
  return id && editor.getTransforms(TanaZoomPlugin).zoom.to(id) ? id : undefined;
}
export const TanaTimePlugin = createPlatePlugin({
  key: TANA_TIME_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  time: {
    goToDay: (day: string) => goToDay(editor, day),
    goToDate: (value: string) => {
      const granularity = getTanaDateGranularity(value);
      if (granularity === 'day') return goToDay(editor, value);
      if (granularity === 'month' && isTanaMonth(value)) return goToSimpleCalendarNode(editor, { unit: 'month', value });
      if (granularity === 'year' && isTanaYear(value)) return goToSimpleCalendarNode(editor, { unit: 'year', value });
      if (granularity === 'week' && isTanaWeek(value)) return editor.getTransforms(TanaTimePlugin).time.goToWeek(value);
      const interval = parseTanaDateValue(value);
      if (!interval || granularity === 'time') return undefined;
      const day = interval.start.toISOString().slice(0, 10);
      return isTanaDay(day) ? goToDay(editor, day) : undefined;
    },
    goToMonth: (month: string) => {
      if (!isTanaMonth(month)) return;
      return goToSimpleCalendarNode(editor, { unit: 'month', value: month });
    },
    goToYear: (year: string) => isTanaYear(year) ? goToSimpleCalendarNode(editor, { unit: 'year', value: year }) : undefined,
    goToWeek: (week: string) => {
      if (!isTanaWeek(week)) return;
      const daily = getDailyNotesEntry(editor);
      if (!daily) return;
      const year = week.slice(0, 4) as `${number}`;
      let weekId: NodeId | undefined;
      editor.tf.withNewBatch(() => {
        const dailyIndent = typeof daily[0].indent === 'number' ? daily[0].indent : 0;
        const yearId = ensureCalendarNode(
          editor,
          getTanaYearTime(year),
          daily[0].id as NodeId,
          dailyIndent,
        );
        if (!yearId) return;
        const parent = getTanaNodeEntry(editor, yearId);
        const indent = typeof parent?.[0].indent === 'number'
          ? parent[0].indent
          : dailyIndent + 1;
        weekId = ensureCalendarNode(editor, getTanaWeekTime(week), yearId, indent);
      });
      return weekId && editor.getTransforms(TanaZoomPlugin).zoom.to(weekId) ? weekId : undefined;
    },
    nextDay: () => {
      const current = focusedCalendarTime(editor);
      if (current?.unit === 'month' && isTanaMonth(current.value)) {
        const [year, month] = current.value.split('-').map(Number);
        const next = new Date(Date.UTC(year, month, 1));
        return goToSimpleCalendarNode(editor, { unit: 'month', value: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}` });
      }
      if (current?.unit === 'year' && isTanaYear(current.value)) return goToSimpleCalendarNode(editor, { unit: 'year', value: String(Number(current.value) + 1) });
      const day = addTanaDays(
        (focusedCalendarDay(editor) ?? getTanaToday(getWorkspaceTimeZone(editor))) as `${number}-${number}-${number}`,
        current?.unit === 'week' ? 7 : 1,
      );
      return current?.unit === 'week'
        ? editor.getTransforms(TanaTimePlugin).time.goToWeek(getTanaWeekForDay(day))
        : goToDay(editor, day);
    },
    previousDay: () => {
      const current = focusedCalendarTime(editor);
      if (current?.unit === 'month' && isTanaMonth(current.value)) {
        const [year, month] = current.value.split('-').map(Number);
        const previous = new Date(Date.UTC(year, month - 2, 1));
        return goToSimpleCalendarNode(editor, { unit: 'month', value: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}` });
      }
      if (current?.unit === 'year' && isTanaYear(current.value)) return goToSimpleCalendarNode(editor, { unit: 'year', value: String(Number(current.value) - 1) });
      const day = addTanaDays(
        (focusedCalendarDay(editor) ?? getTanaToday(getWorkspaceTimeZone(editor))) as `${number}-${number}-${number}`,
        current?.unit === 'week' ? -7 : -1,
      );
      return current?.unit === 'week'
        ? editor.getTransforms(TanaTimePlugin).time.goToWeek(getTanaWeekForDay(day))
        : goToDay(editor, day);
    },
    today: () => goToDay(editor, getTanaToday(getWorkspaceTimeZone(editor))),
  },
}));
