'use client';

import * as React from 'react';

import type { TComboboxInputElement, TMentionElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { IS_APPLE, KEYS } from 'platejs';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
} from 'platejs/react';

import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { useTanaIndex } from '@/components/tana/tana-index-context';
import { useTanaNavigation } from '@/components/tana/tana-navigation-context';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  getNodeDisplayNameFromIndex,
  getNodeReferenceCandidatesFromIndex,
} from '@/lib/tana/index';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const { element } = props;
  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();
  const tanaNavigation = useTanaNavigation();
  const index = useTanaIndex();
  const targetNodeId = typeof element.key === 'string' ? element.key : '';
  const displayName = getNodeDisplayNameFromIndex(index, targetNodeId);

  const navigateToTarget = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;

      const targetNodeId = element.key;

      if (typeof targetNodeId !== 'string') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (tanaNavigation) {
        tanaNavigation.navigateToNode(targetNodeId);
      } else {
        props.editor.getTransforms(TanaZoomPlugin).zoom.to(targetNodeId);
      }
    },
    [element.key, props.editor, tanaNavigation]
  );

  return (
    <PlateElement
      {...props}
      className={cn(
        'inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline font-medium text-sm',
        !readOnly && 'cursor-pointer',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-target-node-id': targetNodeId,
        draggable: true,
        onClick: navigateToTarget,
        onKeyDown: navigateToTarget,
        role: 'link',
        tabIndex: 0,
      }}
    >
      {mounted && IS_APPLE ? (
        // Mac OS IME https://github.com/ianstormtaylor/slate/issues/3490
        <>
          {props.children}
          {props.prefix}
          {displayName}
        </>
      ) : (
        // Others like Android https://github.com/ianstormtaylor/slate/pull/5360
        <>
          {props.prefix}
          {displayName}
          {props.children}
        </>
      )}
    </PlateElement>
  );
}

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const candidates = getNodeReferenceCandidatesFromIndex(useTanaIndex());

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        value={search}
        element={element}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
      >
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2">
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>没有结果</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {candidates.map((candidate) => {
              const item = { key: candidate.id, text: candidate.text };

              return (
                <InlineComboboxItem
                  key={item.key}
                  value={item.text}
                  onClick={() => {
                    editor.getTransforms({ key: KEYS.mention }).insert.mention({
                      key: item.key,
                      search,
                      value: undefined,
                    });
                    editor.tf.move({ unit: 'offset' });
                  }}
                >
                  {item.text}
                </InlineComboboxItem>
              );
            })}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
