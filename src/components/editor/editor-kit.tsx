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
import { IndentKit } from '@/components/editor/plugins/indent-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { MentionKit } from '@/components/editor/plugins/mention-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { SupertagKit } from '@/components/editor/plugins/supertag-kit';
import { TanaIntegrityPlugin } from '@/components/editor/plugins/tana-integrity-plugin';
import { TanaNodeIdentityPlugin } from '@/components/editor/plugins/tana-node-identity-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaSearchPlugin } from '@/components/editor/plugins/tana-search-plugin';
import { TanaTimePlugin } from '@/components/editor/plugins/tana-time-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { ToggleKit } from '@/components/editor/plugins/toggle-kit';

export const EditorKit = [
  // Local Tana semantics: its focusedNodeId lives in the Plate plugin store.
  TanaZoomPlugin,
  TanaNodeIdentityPlugin,
  TanaTimePlugin,
  TanaNodeLifecyclePlugin,

  // Elements
  ...BasicBlocksKit,
  ...ToggleKit,
  ...LinkKit,
  ...MentionKit,
  ...SupertagKit,
  ...FieldKit,
  TanaReferencePlugin,
  TanaSearchPlugin,
  TanaViewPlugin,
  TanaPresentationPlugin,
  TanaIntegrityPlugin,

  // Marks
  ...BasicMarksKit,

  // Block Style
  ...IndentKit,
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
