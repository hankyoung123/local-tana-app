'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
import { RangeApi } from 'platejs';
import { createPlatePlugin } from 'platejs/react';

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
  .extend(({ editor }) => ({
    handlers: {
      onKeyDown: ({ event }) => {
        if (event.key !== '#' || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;

        // The separator key can cause Slate to commit a DOM selection one
        // frame after the browser dispatches the next key. Reconcile that
        // selection at keydown time, before the official trigger transform
        // checks editor.selection. This only repairs Slate's selection; the
        // combobox plugin remains the sole owner of trigger insertion.
        const domSelection = window.getSelection();
        if (!domSelection || domSelection.rangeCount === 0) return;

        const range = editor.api.toSlateRange(domSelection, {
          exactMatch: false,
          suppressThrow: true,
        });
        if (range && (!editor.selection || !RangeApi.equals(editor.selection, range))) {
          editor.tf.select(range);
        }
      },
    },
  }))
  .overrideEditor((context) => withTriggerCombobox(context as never))
  .withComponent(SupertagElement);

export const SupertagKit = [
  TanaSupertagPlugin,
  SupertagPlugin,
  SupertagInputPlugin,
];
