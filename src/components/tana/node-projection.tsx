'use client';

import { ElementApi, KEYS, TextApi } from 'platejs';
import type { Descendant, TElement, TText } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import {
  getNodeDisplayNameFromIndex,
  getTanaReferenceTargetResolution,
  resolveTanaNodeTitle,
  getTanaProjectionTarget,
  type NodeId,
  type TanaFieldNode,
  type TanaIndex,
  type TanaNode,
} from '@/lib/tana';

import { TanaNodeBullet } from './tana-node-gutter';

type ProjectionVariant = 'block-reference' | 'search-result';

/** Shared geometry for canonical-derived rows in References, Search, and Cards. */
const projectionRowClassName =
  'tana-projectionRow flex min-h-8 items-center gap-2 rounded px-1.5 py-0.5 text-[13px] leading-5 text-[var(--tana-text-secondary)] transition-colors hover:bg-[var(--tana-hover)]';
const projectionTitleClassName =
  'min-w-0 flex-1 truncate px-1 py-0.5 font-medium text-[13px] leading-5 text-[var(--tana-text)]';

/** Renders canonical rich title content without constructing a second Plate document. */
function RichTitleProjection({
  index,
  nodes,
}: {
  index: TanaIndex;
  nodes: readonly Descendant[];
}) {
  return (
    <span className={`${projectionTitleClassName} block overflow-hidden text-ellipsis whitespace-nowrap`}>
      {nodes.map((node, position) => (
        <ProjectedTitleNode index={index} key={position} node={node} />
      ))}
    </span>
  );
}

function ProjectedTitleNode({
  index,
  node,
}: {
  index: TanaIndex;
  node: Descendant;
}): React.ReactNode {
  if (TextApi.isText(node)) {
    const leaf = node as TText & {
      bold?: boolean;
      code?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      underline?: boolean;
    };
    let content: React.ReactNode = leaf.text;

    if (leaf.bold) content = <strong>{content}</strong>;
    if (leaf.italic) content = <em>{content}</em>;
    if (leaf.underline) content = <u>{content}</u>;
    if (leaf.strikethrough) content = <s>{content}</s>;
    if (leaf.code) content = <code>{content}</code>;

    return content;
  }

  if (!ElementApi.isElement(node)) return null;

  const element = node as TElement & { key?: unknown; url?: unknown };

  if (element.type === KEYS.mention && typeof element.key === 'string') {
    const target = getTanaReferenceTargetResolution(index, element.key);
    const label = target.status === 'live'
      ? getNodeDisplayNameFromIndex(index, target.target.id)
      : target.status === 'missing' ? '目标已删除' : '目标不可用';

    return <span className="rounded bg-muted px-1 text-[var(--tana-reference)]">@{label}</span>;
  }

  if (element.type === TANA_SUPERTAG_KEY && typeof element.key === 'string') {
    return <span className="rounded bg-muted px-1 text-[var(--tana-accent)]">#{getNodeDisplayNameFromIndex(index, element.key)}</span>;
  }

  const children = element.children.map((child, position) => (
    <ProjectedTitleNode index={index} key={position} node={child} />
  ));

  if (element.type === KEYS.link && typeof element.url === 'string') {
    return <a className="text-[var(--tana-link)] underline" href={element.url} rel="noreferrer" target="_blank">{children}</a>;
  }

  return <span>{children}</span>;
}

function getFieldValueLabel(index: TanaIndex, field: TanaFieldNode): string | undefined {
  const labels = field.values.map((value) => {
    if (value.type === 'options' || value.type === 'from-supertag') {
      return index.nodesById.get(value.value)?.text || '已删除的节点';
    }

    return String(value.value);
  });

  return labels.length > 0 ? labels.join('、') : undefined;
}

export function ProjectionTitleInput({
  targetNodeId,
  title,
  displayTitle = title,
  readOnly = false,
}: {
  targetNodeId: NodeId;
  title: string;
  displayTitle?: string;
  readOnly?: boolean;
}) {
  const editor = useEditorRef();

  // Expressions are computed from Fields, so treating their generated text as
  // the editable canonical title would overwrite user content. The canonical
  // title remains editable when no expression is active.
  if (readOnly) {
    return <span className={projectionTitleClassName}>{displayTitle}</span>;
  }

  return (
    <input
      aria-label="编辑引用目标标题"
      className={`${projectionTitleClassName} rounded bg-transparent outline-none hover:bg-[var(--tana-hover)] focus:bg-[var(--tana-canvas)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]`}
      data-plate-prevent-deselect
      type="text"
      value={title}
      onChange={(event) =>
        editor
          .getTransforms(TanaReferencePlugin)
          .reference.setTargetTitle(targetNodeId, event.target.value)
      }
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.preventDefault();
      }}
    />
  );
}

/** The projection input changes only a Node's direct canonical text leaf. */
export function getProjectionEditableTitle(target: TanaNode): string {
  const text = target.node.children.find(TextApi.isText);

  return text?.text ?? '';
}

/** Shared presentation for every transient projection of a canonical Node. */
export function TanaNodeRowChrome({
  fieldIds,
  index,
  onEdit,
  target,
  variant,
}: {
  /** Optional presentation-only Field selection used by Cards. */
  fieldIds?: readonly NodeId[];
  index: TanaIndex;
  onEdit?: () => void;
  target: TanaNode;
  variant: ProjectionVariant | 'trash';
}) {
  const editor = useEditorRef();
  const tags = target.supertagIds.map((supertagId) => ({
    id: supertagId,
    text: index.nodesById.get(supertagId)?.text || '未命名标签',
  }));
  const fields = (index.fieldNodesByParent.get(target.id) ?? []).flatMap((field) => {
    if (fieldIds && !fieldIds.includes(field.fieldId)) return [];

    const definition = index.nodesById.get(field.fieldId);
    const value = getFieldValueLabel(index, field);

    return value === undefined
      ? []
      : [{ id: field.id, label: definition?.text || '未命名字段', value }];
  });
  const displayTitle = resolveTanaNodeTitle(index, target.id);
  const editableTitle = getProjectionEditableTitle(target);
  const titleIsExpression = target.titleExpression !== undefined;
  const isBlockReference = variant === 'block-reference';
  // Projection identity is presentation-only: the canonical outline keeps the
  // target's own bullet, while a Reference or Search result declares why the
  // same canonical Node is being shown here.
  const semanticType = variant === 'trash'
    ? target.semanticType
    : isBlockReference ? 'reference' : 'search';
  const navigate = () => editor.getTransforms(TanaZoomPlugin).zoom.to(target.id);
  const edit = onEdit ?? (() => {
    if (!editor.getTransforms(TanaZoomPlugin).zoom.to(target.id)) return;
    const entry = editor.api.node({ at: [], id: target.id });
    if (!entry) return;
    editor.tf.select(editor.api.end(entry[1])!);
    editor.tf.focus();
  });

  return (
    <div
      className={projectionRowClassName}
      contentEditable={false}
      onDoubleClick={isBlockReference ? edit : undefined}
    >
      <button
        aria-label={`打开 ${displayTitle || '未命名节点'}`}
        className={
          isBlockReference
            ? 'shrink-0 text-[var(--tana-reference)]'
            : 'shrink-0 text-[var(--tana-node-bullet)]'
        }
        type="button"
        disabled={variant === 'trash'}
        onClick={navigate}
      >
        <TanaNodeBullet compact={isBlockReference} semanticType={semanticType} />
      </button>
      <div className="min-w-0 flex-1">
        {target.systemNode ? (
          <p className={projectionTitleClassName}>{displayTitle}</p>
        ) : isBlockReference ? (
          <RichTitleProjection index={index} nodes={target.node.children} />
        ) : (
          <ProjectionTitleInput
            displayTitle={displayTitle}
            readOnly={titleIsExpression || variant === 'trash'}
            targetNodeId={target.id}
            title={editableTitle}
          />
        )}
        {tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] leading-4 text-[var(--tana-accent)]"
              >
                #{tag.text}
              </span>
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[var(--tana-text-tertiary)] text-[11px] leading-4">
            {fields.map((field) => (
              <span key={field.id}>{field.label}: {field.value}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Runtime-only canonical Node projection used by block References and Search
 * results. It never stores target content: every displayed field is derived
 * from TanaIndex and title edits go through TanaReferencePlugin.
 */
export function NodeProjection({
  fieldIds,
  index,
  onEdit,
  targetNodeId,
  variant,
}: {
  fieldIds?: readonly NodeId[];
  index: TanaIndex;
  onEdit?: () => void;
  targetNodeId: NodeId | undefined;
  variant: ProjectionVariant;
}) {
  const target = getTanaProjectionTarget(index, targetNodeId);

  if (!target) {
    const semanticType = variant === 'block-reference' ? 'reference' : 'search';

    return (
      <div
        aria-label={variant === 'block-reference' ? '引用：目标已删除' : '搜索结果：目标已删除'}
        className={`${projectionRowClassName} text-[#9a736d]`}
        contentEditable={false}
      >
        <span className="grid size-6 shrink-0 place-items-center">
          <TanaNodeBullet compact semanticType={semanticType} />
        </span>
        <span className="min-w-0 flex-1 truncate">目标已删除</span>
      </div>
    );
  }

  return <TanaNodeRowChrome fieldIds={fieldIds} index={index} onEdit={onEdit} target={target} variant={variant} />;
}
