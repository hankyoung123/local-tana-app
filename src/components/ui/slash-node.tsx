'use client';

import * as React from 'react';

import type { PlateEditor, PlateElementProps } from 'platejs/react';

import {
  ChevronRightIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareIcon,
} from 'lucide-react';
import { type TComboboxInputElement, KEYS } from 'platejs';
import { PlateElement } from 'platejs/react';

import {
  insertBlock,
  insertInlineElement,
} from '@/components/editor/transforms';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type SlashItem = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onSelect: (editor: PlateEditor, value: string) => void;
};

const blockItems = [
  { icon: <PilcrowIcon />, label: 'Text', value: KEYS.p },
  { icon: <Heading1Icon />, label: 'Heading 1', value: KEYS.h1 },
  { icon: <Heading2Icon />, label: 'Heading 2', value: KEYS.h2 },
  { icon: <Heading3Icon />, label: 'Heading 3', value: KEYS.h3 },
  { icon: <ListIcon />, label: 'Bulleted list', value: KEYS.ul },
  { icon: <ListOrderedIcon />, label: 'Numbered list', value: KEYS.ol },
  { icon: <SquareIcon />, label: 'To-do list', value: KEYS.listTodo },
  { icon: <ChevronRightIcon />, label: 'Toggle', value: KEYS.toggle },
  { icon: <QuoteIcon />, label: 'Quote', value: KEYS.blockquote },
].map((item) => ({
  ...item,
  onSelect: (editor: PlateEditor, value: string) =>
    insertBlock(editor, value, { upsert: true }),
})) satisfies SlashItem[];

const inlineItems = [
  {
    icon: <LinkIcon />,
    label: 'Link',
    value: KEYS.link,
    onSelect: insertInlineElement,
  },
] satisfies SlashItem[];

const groups = [
  { group: 'Outliner', items: blockItems },
  { group: 'Inline', items: inlineItems },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map(({ icon, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  label={label}
                  group={group}
                  onClick={() => onSelect(editor, value)}
                >
                  <div className="mr-2 text-muted-foreground">{icon}</div>
                  {label}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}
