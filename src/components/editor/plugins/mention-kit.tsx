'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';
import { createPlatePlugin } from 'platejs/react';

import {
  DateObjectElement,
  MentionElement,
  MentionInputElement,
} from '@/components/ui/mention-node';

export const MentionKit = [
  createPlatePlugin({
    key: 'tana_date_object',
    node: { isElement: true, isInline: true, isVoid: true, isMarkableVoid: true },
  }).withComponent(DateObjectElement),
  MentionPlugin.configure({
    options: {
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).withComponent(MentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
