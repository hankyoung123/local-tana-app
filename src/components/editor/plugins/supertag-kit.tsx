'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
import { RangeApi, type SlateEditor } from 'platejs';
import { createPlatePlugin, type OverrideEditor } from 'platejs/react';

import {
  SupertagElement,
  SupertagInputElement,
} from '@/components/ui/supertag-node';
import {
  TANA_SUPERTAG_INPUT_KEY,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana';

import { TanaSupertagPlugin } from './tana-supertag-plugin';

/**
 * A browser key can arrive while Slate is still committing the preceding DOM
 * selection (notably after End on a hydrated editor). The trigger combobox
 * intentionally fails closed when `editor.selection` is absent, so reconcile
 * the existing DOM selection immediately before a `#` insert. This keeps the
 * Plate selection as the only writable selection state and leaves the
 * official trigger rule to decide whether the preceding character is valid.
 */
function syncSupertagTriggerSelection(editor: SlateEditor) {
  if (typeof window === 'undefined' || !editor.api.isFocused()) return;

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

const withSupertagTriggerCombobox: OverrideEditor = (context) => {
  const triggerOverride = withTriggerCombobox(context as never);
  const insertText = triggerOverride.transforms?.insertText;

  if (!insertText) return triggerOverride;

  return {
    ...triggerOverride,
    transforms: {
      ...triggerOverride.transforms,
      insertText(text, options) {
        if (text === '#' && !options?.at) {
          syncSupertagTriggerSelection(context.editor);
        }

        return insertText(text, options);
      },
    },
  };
};

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
  .overrideEditor(withSupertagTriggerCombobox)
  .withComponent(SupertagElement);

export const SupertagKit = [
  TanaSupertagPlugin,
  SupertagPlugin,
  SupertagInputPlugin,
];
