import {
  BaseFootnoteDefinitionPlugin,
  BaseFootnoteReferencePlugin,
} from '@platejs/footnote';
import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { type TElement, KEYS } from 'platejs';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { TANA_SUPERTAG_KEY } from '@/lib/tana';

type SupertagElement = TElement & { value?: string };

export const MarkdownKit = [
  BaseFootnoteReferencePlugin,
  BaseFootnoteDefinitionPlugin,
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [
        remarkMath,
        remarkGfm,
        remarkEmoji as any,
        remarkMdx,
        remarkMention,
      ],
      rules: {
        [TANA_SUPERTAG_KEY]: {
          serialize: (node: SupertagElement) => ({
            type: 'text',
            value: typeof node.value === 'string' ? `#${node.value}` : '#',
          }),
        },
      },
    },
  }),
];
