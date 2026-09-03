'use client';

import { ArrowUpRightIcon, Link2Icon } from 'lucide-react';
import { TextApi } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  resolveTanaNodeTitle,
  type NodeId,
  type TanaFieldNode,
  type TanaIndex,
  type TanaNode,
} from '@/lib/tana';

type ProjectionVariant = 'block-reference' | 'search-result';

function getFieldValueLabel(index: TanaIndex, field: TanaFieldNode): string | undefined {
  const value = field.value;

  if (!value) return;
  if (value.type === 'options' || value.type === 'from-supertag') {
    return index.nodesById.get(value.value)?.text || '已删除的节点';
  }

  return String(value.value);
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
    return <span className="min-w-0 flex-1 truncate px-1 py-0.5 font-medium">{displayTitle}</span>;
  }

  return (
    <input
      aria-label="编辑引用目标标题"
      className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 font-medium outline-none hover:bg-[#f3f6f4] focus:bg-white focus:ring-1 focus:ring-[#8bb69b]"
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

/**
 * Runtime-only canonical Node projection used by block References and Search
 * results. It never stores target content: every displayed field is derived
 * from TanaIndex and title edits go through TanaReferencePlugin.
 */
export function NodeProjection({
  index,
  targetNodeId,
  variant,
}: {
  index: TanaIndex;
  targetNodeId: NodeId | undefined;
  variant: ProjectionVariant;
}) {
  const editor = useEditorRef();
  const target = targetNodeId ? index.nodesById.get(targetNodeId) : undefined;
  const navigate = () => {
    if (target) editor.getTransforms(TanaZoomPlugin).zoom.to(target.id);
  };

  if (!target) {
    return variant === 'block-reference' ? (
      <div
        aria-label="引用：目标已删除"
        className="flex h-8 items-center gap-2 bg-white pr-4 text-[13px] text-[#9a736d]"
        contentEditable={false}
      >
        <Link2Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>引用目标已删除</span>
      </div>
    ) : (
      <article className="flex items-center gap-2 px-4 py-3 text-[#9a736d] text-sm">
        <Link2Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>搜索结果目标已删除</span>
      </article>
    );
  }

  const tags = target.supertagIds.map((supertagId) => ({
    id: supertagId,
    text: index.nodesById.get(supertagId)?.text || '未命名标签',
  }));
  const fields = (index.fieldNodesByParent.get(target.id) ?? []).flatMap((field) => {
    const definition = index.nodesById.get(field.fieldId);
    const value = getFieldValueLabel(index, field);

    return value === undefined
      ? []
      : [{ id: field.id, label: definition?.text || '未命名字段', value }];
  });
  const displayTitle = resolveTanaNodeTitle(index, target.id);
  const editableTitle = getProjectionEditableTitle(target);
  const titleIsExpression = target.titleExpression !== undefined;

  if (variant === 'block-reference') {
    return (
      <div
        aria-label={`引用：${displayTitle || '未命名节点'}`}
        className="flex h-8 items-center gap-2 bg-white pr-4 text-[13px] text-[#3d4941]"
        contentEditable={false}
        role="link"
        tabIndex={0}
        onClick={navigate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigate();
          }
        }}
      >
        <Link2Icon aria-hidden="true" className="size-3.5 shrink-0 text-[#789083]" />
        {target.systemNode ? (
          <span className="min-w-0 flex-1 truncate font-medium">{displayTitle}</span>
        ) : (
          <ProjectionTitleInput
            displayTitle={displayTitle}
            readOnly={titleIsExpression}
            targetNodeId={target.id}
            title={editableTitle}
          />
        )}
        {tags.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[#6d8778] text-[11px]">
            {tags.map((tag) => <span key={tag.id}>#{tag.text}</span>)}
          </span>
        )}
      </div>
    );
  }

  return (
    <article className="flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
      <button
        aria-label={`打开 ${displayTitle || '未命名节点'}`}
        className="mt-0.5 shrink-0 text-muted-foreground"
        type="button"
        onClick={navigate}
      >
        <ArrowUpRightIcon className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        {target.systemNode ? (
          <p className="truncate px-1 py-0.5 font-medium text-sm">{displayTitle}</p>
        ) : (
          <ProjectionTitleInput
            displayTitle={displayTitle}
            readOnly={titleIsExpression}
            targetNodeId={target.id}
            title={editableTitle}
          />
        )}
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800"
              >
                #{tag.text}
              </span>
            ))}
          </div>
        )}
        {fields.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-xs">
            {fields.map((field) => (
              <span key={field.id}>{field.label}: {field.value}</span>
            ))}
          </div>
        )}
      </div>
      <button
        className="shrink-0 text-[#7d8a82] text-xs hover:text-[#275d48]"
        type="button"
        onClick={navigate}
      >
        检查
      </button>
    </article>
  );
}
