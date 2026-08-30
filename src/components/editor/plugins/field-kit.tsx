'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
import { type SlateEditor } from 'platejs';
import { createPlatePlugin } from 'platejs/react';

import { FieldInputElement } from '@/components/ui/field-node';
import {
  TANA_FIELD_COMBOBOX_KEY,
  TANA_FIELD_INPUT_KEY,
  isAdHocFieldInputNode,
  isSupertagFieldInputNode,
} from '@/lib/tana';

function isFieldInput(editor: SlateEditor): boolean {
  const block = editor.api.block();

  if (!block) return false;

  return (
    isSupertagFieldInputNode(editor.children, block[1]) ||
    isAdHocFieldInputNode(editor.children, block[1])
  );
}

const FieldInputPlugin = createPlatePlugin({
  editOnly: true,
  key: TANA_FIELD_INPUT_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
  },
}).withComponent(FieldInputElement);

const FieldComboboxPlugin = createPlatePlugin<
  typeof TANA_FIELD_COMBOBOX_KEY,
  TriggerComboboxPluginOptions
>({
  key: TANA_FIELD_COMBOBOX_KEY,
  options: {
    createComboboxInput: () => ({
      children: [{ text: '' }],
      type: TANA_FIELD_INPUT_KEY,
    }),
    trigger: '>',
    triggerPreviousCharPattern: /.*/,
    triggerQuery: isFieldInput,
  },
}).overrideEditor((context) => withTriggerCombobox(context as never));

export const FieldKit = [FieldComboboxPlugin, FieldInputPlugin];
