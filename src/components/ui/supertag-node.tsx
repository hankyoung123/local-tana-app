'use client';

import * as React from 'react';

import type { TComboboxInputElement, TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { HashIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { PlateElement } from 'platejs/react';

import { useTanaIndex } from '@/components/tana/tana-index-context';
import {
  canNavigate as canNavigateNode,
  isTanaNodeElement,
  isTanaNodeActive,
  isTanaNodeInTrash,
} from '@/lib/tana';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { useTanaInspector } from '@/components/tana/tana-inspector-context';
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
  const inspectNode = useTanaInspector();
  const index = useTanaIndex();
  const displayName = getNodeDisplayNameFromIndex(index, element.key);
  const target = index.nodesById.get(element.key);
  const live = !!target && isTanaNodeActive(index, target.id) &&
    target.semanticTypes.includes('supertag-definition') && canNavigateNode(element);
  const trashed = !!target && isTanaNodeInTrash(index, target.id);
  const targetLabel = target?.text || (trashed ? '已移至回收站' : '已删除的超级标签');
  const inputPath = editor.api.findPath(element);
  const host = inputPath ? editor.children[inputPath[0]] : undefined;
  const hostId = host && inputPath && isTanaNodeElement(host, [inputPath[0]]) ? host.id : undefined;
  const canInspect = live && !!inspectNode && typeof hostId === 'string' && index.nodesById.has(hostId);
  const canRemove = typeof hostId === 'string' && typeof element.key === 'string';

  const openProperties = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
      if (!live) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof hostId === 'string') inspectNode?.(hostId);
    },
    [hostId, inspectNode, live]
  );

  const removeFromHost = React.useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    if (!canRemove) return;
    event.preventDefault();
    event.stopPropagation();
    editor.getTransforms(TanaSupertagPlugin).supertag.remove(hostId, element.key);
  }, [canRemove, editor, element.key, hostId]);

  const restoreDefinition = React.useCallback((event: React.MouseEvent | React.KeyboardEvent) => {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    if (!trashed) return;
    event.preventDefault();
    event.stopPropagation();
    editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(element.key);
  }, [editor, element.key, trashed]);

  return (
    <PlateElement
      {...props}
      className="tana-supertag-token group inline-flex items-center align-baseline"
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
    >
      {canInspect ? (
        <button
          aria-label={`查看 ${displayName} 属性`}
          className="rounded-sm px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tana-accent)]/60"
          data-plate-prevent-deselect
          tabIndex={0}
          type="button"
          onClick={openProperties}
          onKeyDown={openProperties}
          onMouseDown={(event) => event.preventDefault()}
        >
          #{displayName}
        </button>
      ) : (
        <span aria-label={live ? undefined : trashed ? `超级标签 ${targetLabel}（已移至回收站）` : `超级标签 ${targetLabel}（已删除）`}>
          #{live ? displayName : targetLabel}
        </span>
      )}
      {trashed && (
        <button
          aria-label="恢复超级标签定义"
          className="ml-0.5 rounded-sm p-0.5 text-[var(--tana-accent)] hover:bg-[var(--tana-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tana-accent)]/60"
          data-plate-prevent-deselect
          title="恢复超级标签定义"
          type="button"
          onClick={restoreDefinition}
          onKeyDown={restoreDefinition}
        >
          <RotateCcwIcon aria-hidden="true" className="size-3" />
        </button>
      )}
      {canRemove && (
        <button
          aria-label={`移除超级标签 ${displayName}`}
          className="ml-0.5 rounded-sm p-0.5 text-[var(--tana-accent)] opacity-0 hover:bg-[var(--tana-hover)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tana-accent)]/60 group-hover:opacity-100"
          data-plate-prevent-deselect
          title="移除超级标签"
          type="button"
          onClick={removeFromHost}
          onKeyDown={removeFromHost}
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      )}
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
    transforms.createAndApply(targetNodeId, normalizedSearch);
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
        <span className="tana-supertag-token inline-flex items-center align-baseline">
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
                <PlusIcon className="mr-2 text-[var(--tana-accent)]" />
                <span className={cn('truncate')}>创建 #{normalizedSearch}</span>
              </InlineComboboxItem>
            )}
            {candidates.map((candidate) => (
              <InlineComboboxItem
                key={candidate.id}
                value={candidate.text}
                onClick={() => applyCandidate(candidate.id)}
              >
                <HashIcon className="mr-2 text-[var(--tana-accent)]" />
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
