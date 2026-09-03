import { ElementApi } from 'platejs';
import type { Path } from 'platejs';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import { isTanaNodeElement } from '@/lib/tana/constants';
import {
  addTanaDays,
  formatTanaDay,
  getTanaDayNodeId,
  getTanaDayTime,
  getTanaToday,
  isTanaDay,
} from '@/lib/tana/time';
import { buildTanaIndex } from '@/lib/tana/index';
import { getTanaNodeDescendantPaths } from '@/lib/tana/outliner';
import type { NodeId, TanaBlockElement } from '@/lib/tana/types';

import { TanaZoomPlugin } from './tana-zoom-plugin';

export const TANA_TIME_PLUGIN_KEY = 'tanaTime' as const;

function getTanaNodeEntry(editor: PlateEditor, nodeId: NodeId) {
  const entry = editor.api.node({ at: [], id: nodeId });

  return entry && ElementApi.isElement(entry[0]) && isTanaNodeElement(entry)
    ? (entry as [TanaBlockElement, Path])
    : undefined;
}

function getDailyNotesEntry(editor: PlateEditor) {
  const dailyNotesId = buildTanaIndex(editor.children).systemNodeIds.get('daily-notes');

  return dailyNotesId ? getTanaNodeEntry(editor, dailyNotesId) : undefined;
}

/** Returns the insertion path which keeps direct Day Nodes in calendar order. */
function getDayInsertionPath(editor: PlateEditor, dailyNotesPath: Path, day: string): Path {
  const dailyNotes = editor.api.node(dailyNotesPath)?.[0] as TanaBlockElement | undefined;
  const dailyIndent = typeof dailyNotes?.indent === 'number' ? dailyNotes.indent : 0;
  const insertionPath: Path = [
    (getTanaNodeDescendantPaths(editor.children, dailyNotesPath).at(-1)?.[0] ??
      dailyNotesPath[0]) + 1,
  ];

  for (let index = dailyNotesPath[0] + 1; index < editor.children.length; index += 1) {
    const node = editor.children[index];

    if (!ElementApi.isElement(node) || !isTanaNodeElement(node, [index])) continue;
    const indent = typeof node.indent === 'number' ? node.indent : 0;

    if (indent <= dailyIndent) break;

    const time = (node as TanaBlockElement).tanaTime;

    if (time?.unit === 'day' && time.value > day) return [index];
  }

  return insertionPath;
}

/** Creates or opens the canonical Day Node owned by the Daily Notes system Node. */
function goToDay(editor: PlateEditor, day: string): NodeId | undefined {
  if (!isTanaDay(day)) return;

  const index = buildTanaIndex(editor.children);
  const existingId = getTanaDayNodeId(index.timeNodeIds, day);

  if (existingId) {
    return editor.getTransforms(TanaZoomPlugin).zoom.to(existingId) ? existingId : undefined;
  }

  const dailyNotesEntry = getDailyNotesEntry(editor);

  if (!dailyNotesEntry) return;

  const [dailyNotes, dailyNotesPath] = dailyNotesEntry;
  const indent = typeof dailyNotes.indent === 'number' ? dailyNotes.indent + 1 : 1;
  const path = getDayInsertionPath(editor, dailyNotesPath, day);

  editor.tf.insertNodes(
    editor.api.create.block({
      children: [{ text: formatTanaDay(day) }],
      indent,
      tanaTime: getTanaDayTime(day),
    }),
    { at: path }
  );

  const created = editor.api.node(path)?.[0] as TanaBlockElement | undefined;

  if (typeof created?.id !== 'string') return;

  return editor.getTransforms(TanaZoomPlugin).zoom.to(created.id) ? created.id : undefined;
}

function getFocusedDay(editor: PlateEditor) {
  const focusedNodeId = editor.getOption(TanaZoomPlugin, 'focusedNodeId');
  const node = typeof focusedNodeId === 'string' ? getTanaNodeEntry(editor, focusedNodeId)?.[0] : undefined;

  return node?.tanaTime?.unit === 'day' && isTanaDay(node.tanaTime.value)
    ? node.tanaTime.value
    : undefined;
}

/** Owns only Day Node mutation and navigation; no calendar state is persisted separately. */
export const TanaTimePlugin = createPlatePlugin({
  key: TANA_TIME_PLUGIN_KEY,
}).extendEditorTransforms(({ editor }) => ({
  time: {
    goToDay: (day: string) => goToDay(editor, day),
    nextDay: () => goToDay(editor, addTanaDays(getFocusedDay(editor) ?? getTanaToday(), 1)),
    previousDay: () => goToDay(editor, addTanaDays(getFocusedDay(editor) ?? getTanaToday(), -1)),
    today: () => goToDay(editor, getTanaToday()),
  },
}));
