'use client';

import * as React from 'react';

import type { TComboboxInputElement, TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { HashIcon, PlusIcon } from 'lucide-react';
import { PlateElement } from 'platejs/react';

import { useTanaIndex } from '@/components/tana/tana-index-context';
import {
  canNavigate as canNavigateNode,
  isTanaNodeElement,
} from '@/lib/tana';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  getNodeDisplayNameFromIndex,
  getSupertagCandidatesFromIndex,
} from '@/lib/tana/index';
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
};

export function SupertagElement(
  props: PlateElementProps<SupertagElementType>
) {
  const { element, editor } = props;
  const displayName = getNodeDisplayNameFromIndex(useTanaIndex(), element.key);

  const navigateToDefinition = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
      if (!canNavigateNode(element)) return;

      event.preventDefault();
      event.stopPropagation();
      editor.getTransforms(TanaZoomPlugin).zoom.to(element.key);
    },
    [editor, element]
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
      #{displayName}
      {props.children}
    </PlateElement>
  );
}

export function SupertagInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const candidates = getSupertagCandidatesFromIndex(useTanaIndex());
  const targetNodeId = React.useMemo(() => {
    const inputPath = editor.api.findPath(element);
    const targetPath = inputPath ? [inputPath[0]] : undefined;
    const targetNode = targetPath ? editor.children[targetPath[0]] : undefined;

    return targetNode &&
      targetPath &&
      isTanaNodeElement(targetNode, targetPath) &&
      typeof targetNode.id === 'string'
      ? targetNode.id
      : undefined;
  }, [editor, element]);
  const normalizedSearch = search.trim();
  const hasExactCandidate = candidates.some(
    (candidate) =>
      candidate.text.trim().localeCompare(normalizedSearch, undefined, {
        sensitivity: 'accent',
        usage: 'search',
      }) === 0
  );

  const applyCandidate = React.useCallback(
    (supertagId: string) => {
      if (!targetNodeId) return;

      editor.getTransforms(TanaSupertagPlugin).supertag.apply(
        targetNodeId,
        supertagId
      );
    },
    [editor, targetNodeId]
  );
  const createAndApplySupertag = () => {
    if (!targetNodeId) return;

    const transforms = editor.getTransforms(TanaSupertagPlugin).supertag;
    const supertagId = transforms.create(normalizedSearch);

    if (supertagId) transforms.apply(targetNodeId, supertagId);
  };

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
          <InlineComboboxEmpty>没有超级标签</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {normalizedSearch && !hasExactCandidate && (
              <InlineComboboxItem
                value={normalizedSearch}
                onClick={createAndApplySupertag}
              >
                <PlusIcon className="mr-2 text-emerald-700" />
                <span className={cn('truncate')}>创建 #{normalizedSearch}</span>
              </InlineComboboxItem>
            )}
            {candidates.map((candidate) => (
              <InlineComboboxItem
                key={candidate.id}
                value={candidate.text}
                onClick={() => applyCandidate(candidate.id)}
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
