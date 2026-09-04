'use client';

import { SlashInputPlugin, SlashPlugin } from '@platejs/slash-command/react';
import { type SlateEditor, KEYS } from 'platejs';

import { SlashInputElement } from '@/components/ui/slash-node';
import { canUseSlashCommand } from '@/lib/tana/node-behavior';

export const SlashKit = [
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor: SlateEditor) => {
        const block = editor.api.block();

        return (
          !!block &&
          !editor.api.some({
            match: { type: editor.getType(KEYS.codeBlock) },
          }) &&
          canUseSlashCommand(block[0], {
            document: editor.children,
            path: block[1],
          })
        );
      },
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];
