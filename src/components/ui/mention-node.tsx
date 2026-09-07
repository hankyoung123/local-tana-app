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
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { canNavigate as canNavigateNode } from '@/lib/tana/node-behavior';
import {
  getNodeDisplayNameFromIndex,
  getNodeReferenceCandidatesFromIndex,
  getTanaReferenceTargetResolution,
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
  const index = useTanaIndex();
  const targetNodeId = typeof element.key === 'string' ? element.key : '';
  const target = getTanaReferenceTargetResolution(index, targetNodeId);
  const navigable = target.status === 'live' && canNavigateNode(element);
  const displayName = target.status === 'live'
    ? getNodeDisplayNameFromIndex(index, target.target.id)
    : target.status === 'missing' ? '目标已删除' : '目标不可用';

  const navigateToTarget = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
      if (!navigable || target.status !== 'live') return;

      event.preventDefault();
      event.stopPropagation();

      props.editor.getTransforms(TanaZoomPlugin).zoom.to(target.target.id);
    },
    [navigable, props.editor, target]
  );

  return (
    <PlateElement
      {...props}
      className={cn(
        'inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline font-medium text-sm',
        navigable && !readOnly && 'cursor-pointer',
        !navigable && 'text-muted-foreground',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'aria-label': navigable ? `打开引用 ${displayName}` : `引用：${displayName}`,
        'aria-disabled': navigable ? undefined : true,
        'data-reference-status': target.status,
        'data-target-node-id': targetNodeId,
        draggable: navigable,
        onClick: navigable ? navigateToTarget : undefined,
        onKeyDown: navigable ? navigateToTarget : undefined,
        role: navigable ? 'link' : undefined,
        tabIndex: navigable ? 0 : undefined,
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

  const insertReference = (targetNodeId: string) => {
    const currentNodeId = editor.api.block()?.[0].id;

    if (
      typeof currentNodeId === 'string' &&
      editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode(
        currentNodeId,
        targetNodeId
      )
    ) {
      return;
    }

    editor.getTransforms({ key: KEYS.mention }).insert.mention({
      key: targetNodeId,
      search,
      value: undefined,
    });
    editor.tf.move({ unit: 'offset' });
  };

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
                    insertReference(item.key);
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
