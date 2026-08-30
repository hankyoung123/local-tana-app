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
  { icon: <PilcrowIcon />, label: '文本', value: KEYS.p },
  { icon: <Heading1Icon />, label: '标题 1', value: KEYS.h1 },
  { icon: <Heading2Icon />, label: '标题 2', value: KEYS.h2 },
  { icon: <Heading3Icon />, label: '标题 3', value: KEYS.h3 },
  { icon: <ListIcon />, label: '无序列表', value: KEYS.ul },
  { icon: <ListOrderedIcon />, label: '有序列表', value: KEYS.ol },
  { icon: <SquareIcon />, label: '待办列表', value: KEYS.listTodo },
  { icon: <ChevronRightIcon />, label: '折叠块', value: KEYS.toggle },
  { icon: <QuoteIcon />, label: '引用', value: KEYS.blockquote },
].map((item) => ({
  ...item,
  onSelect: (editor: PlateEditor, value: string) =>
    insertBlock(editor, value, { upsert: true }),
})) satisfies SlashItem[];

const inlineItems = [
  {
    icon: <LinkIcon />,
    label: '链接',
    value: KEYS.link,
    onSelect: insertInlineElement,
  },
] satisfies SlashItem[];

const groups = [
  { group: '大纲', items: blockItems },
  { group: '行内', items: inlineItems },
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
          <InlineComboboxEmpty>没有结果</InlineComboboxEmpty>

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
