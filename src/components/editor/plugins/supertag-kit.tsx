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

function syncSupertagSelection(editor: PlateEditor) {
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

function getDomPreviousCharacter(): string | undefined {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent ?? '';
  return selection.anchorOffset > 0 ? text[selection.anchorOffset - 1] : undefined;
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
  .extend(({ editor }) => ({
    handlers: {
      onKeyDown: ({ event }) => {
        if (event.key !== '#' || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;

        // The separator key can cause Slate to commit a DOM selection one
        // frame after the browser dispatches the next key. Reconcile that
        // selection at keydown time, before the official trigger transform
        // checks editor.selection. This only repairs Slate's selection; the
        // combobox plugin remains the sole owner of trigger insertion.
        syncSupertagSelection(editor);
      },
      onBeforeInput: ({ event }) => {
        const nativeEvent = event.nativeEvent as InputEvent;
        if (nativeEvent.inputType !== 'insertText' || nativeEvent.data !== '#') return;

        // BeforeInput is the last browser event before Plate calls the
        // insertText transform. It is the most reliable point to reconcile a
        // selection that Chromium has just committed after the separator.
        syncSupertagSelection(editor);
      },
    },
  }))
  .overrideEditor((context) => {
    const triggerOverride = withTriggerCombobox(context as never);
    const triggerInsertText = triggerOverride.transforms?.insertText;

    if (!triggerInsertText) return triggerOverride;

    return {
      ...triggerOverride,
      transforms: {
        ...triggerOverride.transforms,
        insertText(text: string, options?: Record<string, unknown>) {
          if (text === '#' && !options?.at) {
            syncSupertagSelection(context.editor);

            // Chromium can deliver beforeinput while its DOM caret already
            // reflects the separator but before Slate has committed that
            // selection. In that narrow case, use the same input element the
            // official trigger transform creates. All later query editing and
            // cancellation remains owned by InlineCombobox.
            const previous = getDomPreviousCharacter();
            if (
              previous !== undefined &&
              /^[\s"']$/.test(previous) &&
              context.editor.selection
            ) {
              const inputNode = {
                children: [{ text: '' }],
                type: TANA_SUPERTAG_INPUT_KEY,
              };
              if (context.editor.meta.userId) {
                (inputNode as { userId?: string }).userId = context.editor.meta.userId;
              }
              return context.editor.tf.insertNodes(inputNode, options);
            }
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
