'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
import { RangeApi } from 'platejs';
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
 * Chromium can deliver the trigger key while Slate is still committing the
 * preceding DOM selection. Reconcile that selection at the transform boundary
 * so the official trigger plugin sees the same caret the user sees. The
 * trigger plugin remains the sole owner of whether and how the input node is
 * inserted.
 */
function syncSupertagTriggerSelection(editor: PlateEditor) {
  if (typeof window === 'undefined') return;

  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;

  const range = editor.api.toSlateRange(domSelection, {
    exactMatch: false,
    suppressThrow: true,
  });

  if (range && (!editor.selection || !RangeApi.equals(editor.selection, range))) {
    editor.tf.select(range);
  }
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
