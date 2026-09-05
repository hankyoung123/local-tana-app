'use client';

import { IndentPlugin } from '@platejs/indent/react';
import { KEYS } from 'platejs';

import { TANA_INDENT_PX } from '@/components/tana/tana-presentation';

export const IndentKit = [
  IndentPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
        KEYS.toggle,
      ],
    },
    options: {
      offset: TANA_INDENT_PX,
    },
  }),
];
