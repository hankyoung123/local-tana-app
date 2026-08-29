'use client';

import * as React from 'react';

import type { TComboboxInputElement, TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { HashIcon } from 'lucide-react';
import { PlateElement, useEditorSelector } from 'platejs/react';

import {
  getSupertagCandidates,
  navigateToNode,
  TANA_SUPERTAG_KEY,
} from '@/lib/tana';
import { cn } from '@/lib/utils';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type SupertagElementType = TElement & {
  key: string;
  value: string;
};

export function SupertagElement(
  props: PlateElementProps<SupertagElementType>
) {
  const { element, editor } = props;

  const navigateToDefinition = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      event.stopPropagation();
      navigateToNode(editor, element.key);
    },
    [editor, element.key]
  );

  return (
    <PlateElement
      {...props}
      className="inline-flex cursor-pointer items-center rounded-md bg-emerald-50 px-1.5 py-0.5 align-baseline font-medium text-emerald-800 text-sm ring-emerald-500/40 hover:bg-emerald-100 focus-visible:ring-2 dark:bg-emerald-950 dark:text-emerald-200"
      attributes={{
        ...props.attributes,
        contentEditable: false,
        onClick: navigateToDefinition,
        onKeyDown: navigateToDefinition,
        role: 'link',
        tabIndex: 0,
      }}
    >
      #{element.value}
      {props.children}
    </PlateElement>
  );
}

export function SupertagInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const candidates = useEditorSelector(
    (currentEditor) => getSupertagCandidates(currentEditor.children),
    [],
    {
      equalityFn: (previous, next) =>
        previous.length === next.length &&
        previous.every(
          (candidate, index) =>
            candidate.id === next[index]?.id &&
            candidate.text === next[index]?.text
        ),
    }
  );

  const applySupertag = React.useCallback(
    (item: { id: string; text: string }) => {
      editor.tf.insertNodes({
        children: [{ text: '' }],
        key: item.id,
        type: TANA_SUPERTAG_KEY,
        value: item.text,
      });
      editor.tf.move({ unit: 'offset' });

      const pathAbove = editor.api.block()?.[1];

      if (
        editor.selection &&
        pathAbove &&
        editor.api.isEnd(editor.selection.anchor, pathAbove)
      ) {
        editor.tf.insertText(' ');
      }
    },
    [editor]
  );

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        value={search}
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="#"
      >
        <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 align-baseline text-emerald-800 text-sm ring-emerald-500/40 focus-within:ring-2 dark:bg-emerald-950 dark:text-emerald-200">
          <HashIcon className="mr-0.5 size-3" />
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>No supertags</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {candidates.map((candidate) => (
              <InlineComboboxItem
                key={candidate.id}
                value={candidate.text}
                onClick={() => applySupertag(candidate)}
              >
                <HashIcon className="mr-2 text-emerald-700" />
                <span className={cn('truncate')}>{candidate.text}</span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
