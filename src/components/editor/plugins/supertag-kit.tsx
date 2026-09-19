'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
import { createPlatePlugin, type PlateEditor } from 'platejs/react';

import {
  SupertagElement,
  SupertagInputElement,
} from '@/components/ui/supertag-node';
import {
  TANA_SUPERTAG_INPUT_KEY,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana';

import { TanaSupertagPlugin } from './tana-supertag-plugin';

const SupertagInputPlugin = createPlatePlugin({
  editOnly: true,
  key: TANA_SUPERTAG_INPUT_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
  },
}).withComponent(SupertagInputElement);

/**
 * The Slate selection is authoritative once it addresses live document paths.
 * Chromium's DOM range can trail a native space insertion by one input event;
 * overwriting a valid Slate caret with that range makes Plate inspect the wrong
 * preceding character and decline the trigger. Only recover from DOM when
 * Slate has no usable selection. `withTriggerCombobox` remains the sole owner
 * of trigger matching and input insertion.
 */
function syncSupertagTriggerSelection(editor: PlateEditor) {
  if (typeof window === 'undefined') return;

  const selection = editor.selection;
  if (
    selection &&
    editor.api.hasPath(selection.anchor.path) &&
    editor.api.hasPath(selection.focus.path)
  ) {
    return;
  }

  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;

  const range = editor.api.toSlateRange(domSelection, {
    exactMatch: false,
    suppressThrow: true,
  });

  if (range) editor.tf.select(range);
}

const SupertagPlugin = createPlatePlugin<
  typeof TANA_SUPERTAG_KEY,
  TriggerComboboxPluginOptions
>({
  key: TANA_SUPERTAG_KEY,
  node: {
    isElement: true,
    isInline: true,
    isMarkableVoid: true,
    isVoid: true,
  },
  options: {
    createComboboxInput: () => ({
      children: [{ text: '' }],
      type: TANA_SUPERTAG_INPUT_KEY,
    }),
    trigger: '#',
    triggerPreviousCharPattern: /^$|^[\s"']$/,
  },
})
  .overrideEditor((context) => {
    const triggerOverride = withTriggerCombobox(context as never);
    const triggerInsertText = triggerOverride.transforms?.insertText;

    if (!triggerInsertText) return triggerOverride;

    return {
      ...triggerOverride,
      transforms: {
        ...triggerOverride.transforms,
        insertText(text, options) {
          if (text === '#' && !options?.at) {
            syncSupertagTriggerSelection(context.editor);
          }

          return triggerInsertText(text, options);
        },
      },
    };
  })
  .withComponent(SupertagElement);

export const SupertagKit = [
  TanaSupertagPlugin,
  SupertagPlugin,
  SupertagInputPlugin,
];
