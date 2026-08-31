'use client';

import { type Value, TrailingBlockPlugin } from 'platejs';
import { type TPlateEditor, useEditorRef } from 'platejs/react';

import { AutoformatKit } from '@/components/editor/plugins/autoformat-kit';
import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { BlockMenuKit } from '@/components/editor/plugins/block-menu-kit';
import { BlockPlaceholderKit } from '@/components/editor/plugins/block-placeholder-kit';
import { CursorOverlayKit } from '@/components/editor/plugins/cursor-overlay-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { ExitBreakKit } from '@/components/editor/plugins/exit-break-kit';
import { FieldKit } from '@/components/editor/plugins/field-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { MentionKit } from '@/components/editor/plugins/mention-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { SupertagKit } from '@/components/editor/plugins/supertag-kit';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { ToggleKit } from '@/components/editor/plugins/toggle-kit';

export const EditorKit = [
  // Local Tana semantics: its focusedNodeId lives in the Plate plugin store.
  TanaZoomPlugin,

  // Elements
  ...BasicBlocksKit,
  ...ToggleKit,
  ...LinkKit,
  ...MentionKit,
  ...SupertagKit,
  ...FieldKit,

  // Marks
  ...BasicMarksKit,

  // Block Style
  ...ListKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...DndKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // UI
  ...BlockPlaceholderKit,
  ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
