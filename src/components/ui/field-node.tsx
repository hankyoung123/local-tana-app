'use client';

import * as React from 'react';

import type { TComboboxInputElement, TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { ListPlusIcon, PlusIcon } from 'lucide-react';
import { PlateElement } from 'platejs/react';

import { useTanaIndex } from '@/components/tana/tana-index-context';
import {
  TanaFieldPlugin,
  type FieldInputChoice,
} from '@/components/editor/plugins/tana-field-plugin';
import {
  getFieldDefinitionCandidatesFromIndex,
  getSupertagFieldInputParentId,
  hasFieldDefinitionExactMatch,
  isAdHocFieldInputNode,
  prioritizeFieldDefinitionCandidates,
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

type FieldInputContext =
  | { kind: 'ad-hoc'; nodeId: string }
  | { kind: 'supertag-template'; supertagId: string; temporaryNodeId: string };

export function FieldInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const candidates = getFieldDefinitionCandidatesFromIndex(useTanaIndex());
  const context = React.useMemo<FieldInputContext | undefined>(() => {
    const inputPath = editor.api.findPath(element);
    const temporaryPath = inputPath ? [inputPath[0]] : undefined;
    const temporaryNode = temporaryPath ? editor.children[temporaryPath[0]] : undefined;
    const supertagId = temporaryPath
      ? getSupertagFieldInputParentId(editor.children, temporaryPath)
      : undefined;

    if (supertagId && typeof temporaryNode?.id === 'string') {
      return {
        kind: 'supertag-template',
        supertagId,
        temporaryNodeId: temporaryNode.id,
      };
    }

    return temporaryPath &&
      typeof temporaryNode?.id === 'string' &&
      isAdHocFieldInputNode(editor.children, temporaryPath)
      ? { kind: 'ad-hoc', nodeId: temporaryNode.id }
      : undefined;
  }, [editor, element]);
  const normalizedSearch = search.trim();
  const prioritizedCandidates = React.useMemo(
    () => prioritizeFieldDefinitionCandidates(candidates, normalizedSearch),
    [candidates, normalizedSearch]
  );
  const hasExactCandidate = hasFieldDefinitionExactMatch(
    candidates,
    normalizedSearch
  );

  const complete = React.useCallback(
    (choice: FieldInputChoice) => {
      if (!context) return;

      const field = editor.getTransforms(TanaFieldPlugin).field;

      if (context.kind === 'supertag-template') {
        field.completeTemplateInput(
          context.temporaryNodeId,
          context.supertagId,
          choice
        );

        return;
      }

      field.completeAdHocInput(context.nodeId, choice);
    },
    [context, editor]
  );

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        element={element as TElement}
        restoreTriggerOnCancel={false}
        setValue={setSearch}
        showTrigger
        trigger=">"
        value={search}
      >
        <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 align-baseline text-sky-800 text-sm ring-sky-500/40 focus-within:ring-2 dark:bg-sky-950 dark:text-sky-200">
          <ListPlusIcon className="mr-0.5 size-3" />
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>没有字段定义</InlineComboboxEmpty>

          <InlineComboboxGroup>
            {normalizedSearch && !hasExactCandidate && (
              <InlineComboboxItem
                value={normalizedSearch}
                onClick={() =>
                  complete({ name: normalizedSearch, type: 'create' })
                }
              >
                <PlusIcon className="mr-2 text-sky-700" />
                <span className={cn('truncate')}>创建 &gt;{normalizedSearch}</span>
              </InlineComboboxItem>
            )}
            {prioritizedCandidates.map((candidate) => (
              <InlineComboboxItem
                key={candidate.id}
                value={candidate.text}
                onClick={() => complete({ fieldId: candidate.id })}
              >
                <ListPlusIcon className="mr-2 text-sky-700" />
                <span className={cn('truncate')}>
                  {candidate.text || candidate.id}
                </span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
