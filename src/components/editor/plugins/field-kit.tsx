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
  getSupertagTemplateAncestorId,
  isTanaNodeElement,
} from '@/lib/tana';

function isEmptySupertagTemplateNode(editor: SlateEditor): boolean {
  const block = editor.api.block();

  if (!block) return false;

  const [node, path] = block;

  return (
    isTanaNodeElement(node, path) &&
    editor.api.string(path) === '' &&
    !!getSupertagTemplateAncestorId(editor.children, path)
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
    triggerQuery: isEmptySupertagTemplateNode,
  },
}).overrideEditor((context) => withTriggerCombobox(context as never));

export const FieldKit = [FieldComboboxPlugin, FieldInputPlugin];
