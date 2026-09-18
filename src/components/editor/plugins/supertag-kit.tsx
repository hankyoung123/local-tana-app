'use client';

import {
  type TriggerComboboxPluginOptions,
  withTriggerCombobox,
} from '@platejs/combobox';
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
  .overrideEditor((context) => withTriggerCombobox(context as never))
  .withComponent(SupertagElement);

export const SupertagKit = [
  TanaSupertagPlugin,
  SupertagPlugin,
  SupertagInputPlugin,
];
