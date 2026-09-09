'use client';

import * as React from 'react';
import { ElementApi, KEYS, TextApi } from 'platejs';
import type { Descendant, TElement, TText } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TANA_SUPERTAG_KEY } from '@/lib/tana/constants';
import {
  getNodeDisplayNameFromIndex,
  getFieldValueCandidates,
  getTanaReferenceTargetResolution,
  isTanaNodeInTrash,
  resolveTanaNodeTitle,
  resolveTanaNodeTitleSegments,
  getTanaProjectionTarget,
  isTanaTitleExpressionNameEditable,
  type NodeId,
  type TanaFieldNode,
  type FieldValue,
  type TanaIndex,
  type TanaNode,
  type TanaTitleExpressionSegment,
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

/** Renders the safe, derived Title Expression presentation without HTML injection. */
export function TitleExpressionProjection({
  segments,
}: {
  segments: readonly TanaTitleExpressionSegment[];
}) {
  return (
    <span className={projectionTitleClassName} data-title-expression="true">
      {segments.map((segment, position) => {
        let content: React.ReactNode = segment.text;

        if (segment.marks?.italic) content = <em>{content}</em>;
        if (segment.marks?.bold) content = <strong>{content}</strong>;

        return <React.Fragment key={position}>{content}</React.Fragment>;
      })}
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
  displaySegments,
  onExitEdit,
  readOnly = false,
  autoFocus = false,
}: {
  autoFocus?: boolean;
  targetNodeId: NodeId;
  title: string;
  displayTitle?: string;
  displaySegments?: readonly TanaTitleExpressionSegment[];
  onExitEdit?: () => void;
  readOnly?: boolean;
}) {
  const editor = useEditorRef();

  // Expressions are computed from Fields, so treating their generated text as
  // the editable canonical title would overwrite user content. The canonical
  // title remains editable when no expression is active.
  if (readOnly) {
    return displaySegments ? (
      <TitleExpressionProjection segments={displaySegments} />
    ) : (
      <span className={projectionTitleClassName}>{displayTitle}</span>
    );
  }

  return (
    <input
      aria-label="编辑引用目标标题"
      className={`${projectionTitleClassName} rounded bg-transparent outline-none hover:bg-[var(--tana-hover)] focus:bg-[var(--tana-canvas)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]`}
      data-plate-prevent-deselect
      autoFocus={autoFocus}
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
        if (event.key === 'Escape') {
          event.preventDefault();
          onExitEdit?.();
          return;
        }
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
  isEditing = false,
  onEdit,
  onExitEdit,
  target,
  variant,
}: {
  /** Optional presentation-only Field selection used by Cards. */
  fieldIds?: readonly NodeId[];
  index: TanaIndex;
  isEditing?: boolean;
  onEdit?: () => void;
  onExitEdit?: () => void;
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

    return [{
      field,
      id: field.id,
      label: field.brokenFieldDefinition
        ? isTanaNodeInTrash(index, field.fieldId)
          ? `${definition?.text || '字段'}（已移至回收站）`
          : '已删除字段'
        : definition?.text || '未命名字段',
      value: getFieldValueLabel(index, field),
    }];
  });
  const displayTitle = resolveTanaNodeTitle(index, target.id);
  const displaySegments = resolveTanaNodeTitleSegments(index, target.id);
  const editableTitle = getProjectionEditableTitle(target);
  const titleIsExpression =
    target.titleExpression !== undefined &&
    !isTanaTitleExpressionNameEditable(target.titleExpression);
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
      onDoubleClick={isBlockReference && !isEditing ? edit : undefined}
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
          <p className={projectionTitleClassName}>{target.titleExpression ? <TitleExpressionProjection segments={displaySegments} /> : displayTitle}</p>
        ) : isBlockReference && !isEditing ? (
          target.titleExpression ? (
            <TitleExpressionProjection segments={displaySegments} />
          ) : (
            <RichTitleProjection index={index} nodes={target.node.children} />
          )
        ) : (
          <ProjectionTitleInput
            autoFocus={isEditing}
            displayTitle={displayTitle}
            displaySegments={target.titleExpression ? displaySegments : undefined}
            onExitEdit={onExitEdit}
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
              isEditing && variant !== 'trash' ? (
                <ProjectionFieldControl
                  field={field.field}
                  index={index}
                  key={field.id}
                  label={field.label}
                  targetNodeId={target.id}
                />
              ) : (
                <span key={field.id}>
                  {field.label}{field.value === undefined ? '' : `: ${field.value}`}
                </span>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Edit-mode controls are a view over the existing canonical Field Nodes. They
 * deliberately carry neither values nor a projection editor: every event
 * delegates straight to the Field transforms with the canonical Host id.
 */
function ProjectionFieldControl({
  field,
  index,
  label,
  targetNodeId,
}: {
  field: TanaFieldNode;
  index: TanaIndex;
  label: string;
  targetNodeId: NodeId;
}) {
  const editor = useEditorRef();
  const definition = field.brokenFieldDefinition
    ? undefined
    : index.nodesById.get(field.fieldId)?.fieldDefinition;
  const inTrash = isTanaNodeInTrash(index, field.fieldId);
  const transforms = editor.getTransforms(TanaFieldPlugin).field;

  if (!definition) {
    return (
      <span className="flex items-center gap-1" role="status">
        <span>{inTrash ? '字段定义已移至回收站' : '字段定义已删除'}</span>
        {inTrash && (
          <button
            aria-label="恢复字段定义"
            className="rounded px-1 text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() => editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(field.fieldId)}
          >
            恢复
          </button>
        )}
      </span>
    );
  }

  const valueNodeIds = definition.cardinality === 'list'
    ? field.valueNodeIds
    : field.valueNodeId ? [field.valueNodeId] : [];

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-[var(--tana-text-tertiary)]">{label}:</span>
      {valueNodeIds.map((valueNodeId) => (
        <ProjectionFieldValueControl
          definition={definition}
          field={field}
          index={index}
          key={valueNodeId}
          targetNodeId={targetNodeId}
          valueNodeId={valueNodeId}
        />
      ))}
      {definition.cardinality === 'list' && (
        <button
          aria-label={`添加${label}字段值`}
          className="rounded px-1 text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
          type="button"
          onClick={() => transforms.addValue(targetNodeId, field.fieldId)}
        >
          添加
        </button>
      )}
    </span>
  );
}

function ProjectionFieldValueControl({
  definition,
  field,
  index,
  targetNodeId,
  valueNodeId,
}: {
  definition: NonNullable<TanaNode['fieldDefinition']>;
  field: TanaFieldNode;
  index: TanaIndex;
  targetNodeId: NodeId;
  valueNodeId: NodeId;
}) {
  const editor = useEditorRef();
  const transforms = editor.getTransforms(TanaFieldPlugin).field;
  const value = field.valueByNodeId.get(valueNodeId);
  const warning = (field.validationIssuesByValueNodeId.get(valueNodeId) ?? []).length > 0;
  const warningId = `projection-field-warning-${valueNodeId}`;
  const clear = () => definition.cardinality === 'list'
    ? transforms.removeValue(targetNodeId, field.fieldId, valueNodeId)
    : transforms.clearValue(targetNodeId, field.fieldId);
  const set = (next: FieldValue) => definition.cardinality === 'list'
    ? transforms.setValueAt(targetNodeId, field.fieldId, valueNodeId, next)
    : transforms.setValue(targetNodeId, field.fieldId, next);

  if (definition.type === 'checkbox') {
    return (
      <span className="flex items-center gap-1">
        <Checkbox
          aria-describedby={warning ? warningId : undefined}
          aria-invalid={warning || undefined}
          aria-label="复选框字段值"
          checked={value?.type === 'checkbox' ? value.value : false}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') set({ type: 'checkbox', value: checked });
          }}
        />
        <ProjectionFieldWarning id={warningId} warning={warning} />
      </span>
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    const selected = value?.type === definition.type ? value.value : undefined;

    return (
      <span className="flex items-center gap-1">
        <Select
          value={selected}
          onValueChange={(candidateId) => set({
            type: definition.type,
            value: candidateId,
          } as Extract<FieldValue, { type: 'options' | 'from-supertag' }>)}
        >
          <SelectTrigger
            aria-describedby={warning ? warningId : undefined}
            aria-invalid={warning || undefined}
            className="h-6 min-w-24 border-0 bg-transparent px-1 text-[11px] shadow-none"
          >
            <SelectValue placeholder="未设置" />
          </SelectTrigger>
          <SelectContent>
            {getFieldValueCandidates(index, field.fieldId).map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button aria-label="清除字段值" className="rounded px-1 hover:bg-[var(--tana-hover)]" type="button" onClick={clear}>清除</button>
        <ProjectionFieldWarning id={warningId} warning={warning} />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        aria-describedby={warning ? warningId : undefined}
        aria-invalid={warning || undefined}
        aria-label="字段值"
        className="h-6 min-w-24 rounded bg-transparent px-1 text-[11px] outline-none hover:bg-[var(--tana-hover)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]"
        defaultValue={index.nodesById.get(valueNodeId)?.text ?? ''}
        inputMode={definition.type === 'number' ? 'decimal' : undefined}
        placeholder={definition.type === 'date' ? 'YYYY-MM-DD' : undefined}
        type="text"
        onBlur={(event) => {
          const text = event.currentTarget.value;
          if (text === '') clear();
          else transforms.setRawScalarValue(targetNodeId, field.fieldId, text, valueNodeId);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.currentTarget.value = index.nodesById.get(valueNodeId)?.text ?? '';
            event.currentTarget.blur();
          }
        }}
      />
      <button aria-label="清除字段值" className="rounded px-1 hover:bg-[var(--tana-hover)]" type="button" onClick={clear}>清除</button>
      <ProjectionFieldWarning id={warningId} warning={warning} />
    </span>
  );
}

function ProjectionFieldWarning({ id, warning }: { id: string; warning: boolean }) {
  return warning ? (
    <span className="text-amber-700 dark:text-amber-300" id={id} role="status">
      需修正：字段值需要修正
    </span>
  ) : null;
}

/**
 * Runtime-only canonical Node projection used by block References and Search
 * results. It never stores target content: every displayed field is derived
 * from TanaIndex and title edits go through TanaReferencePlugin.
 */
export function NodeProjection({
  fieldIds,
  index,
  isEditing = false,
  onEdit,
  onExitEdit,
  onRestore,
  targetNodeId,
  variant,
}: {
  fieldIds?: readonly NodeId[];
  index: TanaIndex;
  isEditing?: boolean;
  onEdit?: () => void;
  onExitEdit?: () => void;
  onRestore?: () => void;
  targetNodeId: NodeId | undefined;
  variant: ProjectionVariant;
}) {
  const target = getTanaProjectionTarget(index, targetNodeId);

  if (!target) {
    const semanticType = variant === 'block-reference' ? 'reference' : 'search';
    const occurrence = targetNodeId ? index.nodesById.get(targetNodeId) : undefined;
    const resolution = occurrence?.referenceTargetId
      ? getTanaReferenceTargetResolution(index, occurrence.referenceTargetId)
      : undefined;
    const unavailableLabel = resolution?.status === 'trashed-or-unavailable'
      ? '目标不可用'
      : '目标已删除';
    const canRestore = resolution?.status === 'trashed-or-unavailable' &&
      typeof occurrence?.referenceTargetId === 'string' &&
      isTanaNodeInTrash(index, occurrence.referenceTargetId);

    return (
      <div
        aria-label={variant === 'block-reference' ? `引用：${unavailableLabel}` : `搜索结果：${unavailableLabel}`}
        className={`${projectionRowClassName} text-[#9a736d]`}
        contentEditable={false}
        data-reference-status={resolution?.status ?? 'missing'}
      >
        <span className="grid size-6 shrink-0 place-items-center">
          <TanaNodeBullet compact semanticType={semanticType} />
        </span>
        <span className="min-w-0 flex-1 truncate">{unavailableLabel}</span>
        {canRestore && (
          <button
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
            disabled={!onRestore}
            type="button"
            onClick={onRestore}
          >
            恢复原节点
          </button>
        )}
      </div>
    );
  }

  return (
    <TanaNodeRowChrome
      fieldIds={fieldIds}
      index={index}
      isEditing={isEditing}
      onEdit={onEdit}
      onExitEdit={onExitEdit}
      target={target}
      variant={variant}
    />
  );
}
