'use client';

import type { Path, TElement, Value } from 'platejs';
import { KEYS } from 'platejs';
import { BlockPlaceholderPlugin } from 'platejs/react';

import { getNodeSemanticTypes } from '@/lib/tana/node-semantic';
import { TanaZoomPlugin } from './tana-zoom-plugin';

export function isTanaContentPlaceholderNode(
  node: TElement,
  path: Path,
  document: Value,
  focusedNodeId: string | null = null
): boolean {
  return (
    path.length === 1 &&
    node.id !== focusedNodeId &&
    getNodeSemanticTypes(node, { document, path }).includes('content')
  );
}

export const BlockPlaceholderKit = [
  BlockPlaceholderPlugin.configure({
    options: {
      className:
        'before:absolute before:cursor-text before:text-muted-foreground/80 before:content-[attr(placeholder)]',
      placeholders: {
        [KEYS.p]: '输入内容…',
      },
      query: ({ editor, node, path }) =>
        isTanaContentPlaceholderNode(
          node,
          path,
          editor.children,
          editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null
        ),
    },
  }),
];
