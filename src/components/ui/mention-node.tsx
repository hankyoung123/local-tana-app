'use client';

import * as React from 'react';

import type { TComboboxInputElement, TMentionElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { IS_APPLE, KEYS } from 'platejs';
import {
  PlateElement,
  useFocused,
  usePath,
  usePluginOption,
  useReadOnly,
  useSelected,
} from 'platejs/react';

import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { useTanaIndex } from '@/components/tana/tana-index-context';
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { canNavigate as canNavigateNode } from '@/lib/tana/node-behavior';
import {
  getNodeDisplayNameFromIndex,
  getNodeReferenceCandidatesFromIndex,
  getTanaProjectionTarget,
  getTanaReferenceTargetResolution,
  isTanaNodeInTrash,
} from '@/lib/tana/index';
import type { NodeId, TanaIndex } from '@/lib/tana/types';
import { resolveTanaNodeTitle } from '@/lib/tana/title';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

export type InlineReferenceExpansionRow = {
  depth: number;
  id: NodeId;
};

/** Expands only canonical hierarchy; a Reference edge is never traversed. */
export function getInlineReferenceExpansionRows(
  index: TanaIndex,
  targetNodeId: NodeId
): readonly InlineReferenceExpansionRow[] {
  const target = getTanaProjectionTarget(index, targetNodeId);

  if (!target || target.id !== targetNodeId) return [];

  const rows: InlineReferenceExpansionRow[] = [];
  const visited = new Set<NodeId>([targetNodeId]);
  const stack = (index.childrenByParent.get(targetNodeId) ?? [])
    .slice()
    .reverse()
    .map((id) => ({ depth: 1, id }));

  while (stack.length > 0) {
    const row = stack.pop()!;
    const node = index.nodesById.get(row.id);

    if (!node || visited.has(node.id)) continue;
    visited.add(node.id);
    rows.push(row);

    if (node.referenceTargetId !== undefined) continue;

    for (const childId of (index.childrenByParent.get(node.id) ?? []).slice().reverse()) {
      stack.push({ depth: row.depth + 1, id: childId });
    }
  }

  return rows;
}

function InlineReferenceExpansion({
  index,
  targetNodeId,
}: {
  index: TanaIndex;
  targetNodeId: NodeId;
}) {
  const rows = getInlineReferenceExpansionRows(index, targetNodeId);

  if (rows.length === 0) return null;

  return (
    <span
      aria-label="已展开引用子节点"
      className="ml-1 inline-flex max-w-full flex-col rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 py-1 align-top text-xs text-[var(--tana-text-secondary)] shadow-sm"
      contentEditable={false}
    >
      {rows.map(({ depth, id }) => (
        <span key={id} className="truncate" style={{ paddingInlineStart: `${(depth - 1) * 12}px` }}>
          {resolveTanaNodeTitle(index, id) || '未命名节点'}
        </span>
      ))}
    </span>
  );
}

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
  const path = usePath();
  const index = useTanaIndex();
  const targetNodeId = typeof element.key === 'string' ? element.key : '';
  const target = getTanaReferenceTargetResolution(index, targetNodeId);
  const navigable = target.status === 'live' && canNavigateNode(element);
  const canonicalName = target.status === 'live'
    ? getNodeDisplayNameFromIndex(index, target.target.id)
    : target.status === 'missing' ? '目标已删除' : '目标不可用';
  const alias = typeof element.value === 'string' && element.value.trim()
    ? element.value.trim()
    : undefined;
  const displayName = alias ?? canonicalName;
  const occurrencePath = path.join('.');
  const expandedInlineReferencePath = usePluginOption(
    TanaReferencePlugin,
    'expandedInlineReferencePath'
  );
  const expanded = target.status === 'live' && expandedInlineReferencePath === occurrencePath;
  const toggleInlineExpansion = React.useCallback(() => {
    if (target.status !== 'live') return;
    props.editor
      .getTransforms(TanaReferencePlugin)
      .reference.toggleInlineExpansion(occurrencePath, target.target.id);
  }, [occurrencePath, props.editor, target]);

  const navigateToTarget = React.useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (!navigable || target.status !== 'live') return;

      if ('key' in event) {
        if (event.key === 'ArrowDown' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          toggleInlineExpansion();
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
      } else if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleInlineExpansion();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      props.editor.getTransforms(TanaZoomPlugin).zoom.to(target.target.id);
    },
    [navigable, props.editor, target, toggleInlineExpansion]
  );

  const mention = (
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
        'aria-label': navigable
          ? `打开引用 ${displayName}${alias && alias !== canonicalName ? `（${canonicalName}）` : ''}`
          : `引用：${displayName}`,
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
      {target.status === 'trashed-or-unavailable' && isTanaNodeInTrash(index, targetNodeId) && (
        <button
          aria-label="恢复原节点"
          className="ml-1 rounded px-1 text-[10px] text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
          contentEditable={false}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.editor.getTransforms(TanaReferencePlugin).reference.restoreTarget(targetNodeId);
          }}
        >
          恢复原节点
        </button>
      )}
    </PlateElement>
  );

  if (target.status !== 'live') return mention;

  return (
    <>
      <HoverCard openDelay={350}>
        <HoverCardTrigger asChild>{mention}</HoverCardTrigger>
        <HoverCardContent className="w-72 p-3" side="top">
          <p className="truncate font-medium text-sm">{canonicalName || '未命名节点'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {index.childrenByParent.get(target.target.id)?.length ?? 0} 个直接子节点
          </p>
          <button
            className="mt-2 rounded px-1.5 py-1 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={toggleInlineExpansion}
          >
            {expanded ? '收起引用子节点' : '在当前处展开'}
          </button>
        </HoverCardContent>
      </HoverCard>
      {expanded && <InlineReferenceExpansion index={index} targetNodeId={target.target.id} />}
    </>
  );
}

/** Inserts an Inline Reference and consumes a just-captured selected-text alias. */
export function insertTanaInlineReference(
  editor: PlateElementProps<TComboboxInputElement>['editor'],
  targetNodeId: string,
  search: string
): boolean {
  const currentNodeId = editor.api.block()?.[0].id;

  if (
    typeof currentNodeId === 'string' &&
    editor.getTransforms(TanaReferencePlugin).reference.createFromEmptyNode(
      currentNodeId,
      targetNodeId
    )
  ) {
    delete editor.meta.tanaReferencePendingAlias;
    return true;
  }

  const alias = typeof editor.meta.tanaReferencePendingAlias === 'string'
    ? editor.meta.tanaReferencePendingAlias
    : undefined;
  delete editor.meta.tanaReferencePendingAlias;
  editor.getTransforms({ key: KEYS.mention }).insert.mention({
    key: targetNodeId,
    search,
    value: alias,
  });
  editor.tf.move({ unit: 'offset' });
  return true;
}

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const candidates = getNodeReferenceCandidatesFromIndex(useTanaIndex());

  const insertReference = (targetNodeId: string) => {
    insertTanaInlineReference(editor, targetNodeId, search);
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
