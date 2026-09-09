'use client';

import * as React from 'react';

import {
  EyeOffIcon,
  PinIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import type { TElement } from 'platejs';
import { TogglePlugin } from '@platejs/toggle/react';
import { useEditorRef, usePluginOption } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type {
  FieldValue,
  FieldValidationIssue,
  NodeId,
  TanaIndex,
  TanaNode,
  TanaNodeSemanticType,
} from '@/lib/tana';
import {
  getFieldValueCandidates,
  getTanaProjectionTarget,
  isTanaFieldNodePresentationHidden,
  getSupertagTemplateFields,
} from '@/lib/tana';

import { OutlineNodeView } from './outline-node-view';
import { NodeProjection } from './node-projection';
import {
  getTanaDisplayIndentPx,
  TANA_FIELD_LABEL_PX,
} from './tana-presentation';
import { TanaView } from './tana-view';
import { TanaSupertagPage } from './tana-supertag-page';
import { useTanaZoomPresentation } from './tana-zoom-presentation';

export type TanaNodeBlockRendererProps = {
  element: TElement;
  index: TanaIndex;
};

export type TanaNodeWorkspaceRendererProps = {
  focusedNodeId: NodeId | null;
  index: TanaIndex;
  node?: TanaNode;
  selectedNodeId: NodeId | null;
};

export type TanaNodeRenderer = {
  Block?: React.ComponentType<TanaNodeBlockRendererProps>;
  Workspace: React.ComponentType<TanaNodeWorkspaceRendererProps>;
};

const fieldValidationLabels: Record<FieldValidationIssue, string> = {
  'incompatible-type': '字段类型已变更，保留原值',
  'invalid-checkbox': '复选框值无效',
  'invalid-date': '日期格式无效',
  'invalid-email': '邮箱格式无效',
  'invalid-number': '数字不符合字段范围',
  'invalid-option': '选项不在当前候选中',
  'invalid-url': '网址格式无效',
  'missing-reference': '引用目标不可用',
  'missing-required': '必填字段尚未设置',
};

function getFieldValidationLabel(issues: readonly FieldValidationIssue[]): string {
  return Array.from(new Set(issues))
    .map((issue) => fieldValidationLabels[issue])
    .join('；');
}

/** Read-only rows from canonical hierarchy; never traverse Reference edges. */
export function getReferenceSubtreeRows(index: TanaIndex, targetNodeId: NodeId) {
  const rows: Array<{ id: NodeId; depth: number }> = [];
  const target = getTanaProjectionTarget(index, targetNodeId);
  if (!target || target.id !== targetNodeId) return rows;
  const stack = (index.childrenByParent.get(targetNodeId) ?? []).slice().reverse()
    .map((id) => ({ id, depth: 1 }));
  while (stack.length) {
    const row = stack.pop()!;
    const node = index.nodesById.get(row.id);
    if (!node || isTanaFieldNodePresentationHidden(index.document, node.path)) continue;
    rows.push(row);
    for (const id of (index.childrenByParent.get(row.id) ?? []).slice().reverse()) {
      stack.push({ id, depth: row.depth + 1 });
    }
  }
  return rows;
}

/**
 * A block Reference is a read-through projection: its own Plate Node carries
 * only a target NodeId, while title and tags are always derived from — and
 * edits always write to — the canonical target Node.
 */
function ReferenceRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const occurrenceId = typeof element.id === 'string' ? element.id : undefined;
  const targetNodeId = getTanaProjectionTarget(index, occurrenceId)?.id;
  const editor = useEditorRef();
  const openIds = usePluginOption(TogglePlugin, 'openIds');
  const editingReferenceId = usePluginOption(TanaReferencePlugin, 'editingReferenceId');
  const open = typeof element.id === 'string' && openIds?.has(element.id);
  const { baseIndent } = useTanaZoomPresentation();
  const indent = typeof element.indent === 'number' ? element.indent : 0;
  const children = targetNodeId ? index.childrenByParent.get(targetNodeId) ?? [] : [];
  const rows = open && targetNodeId ? getReferenceSubtreeRows(index, targetNodeId) : [];
  const reference = editor.getTransforms(TanaReferencePlugin).reference;
  const isEditing = occurrenceId !== undefined && editingReferenceId === occurrenceId;
  return (
    <div
      aria-label="节点引用"
      className="relative z-20 bg-[var(--tana-canvas)]"
      contentEditable={false}
      style={{ marginLeft: `${getTanaDisplayIndentPx(indent, baseIndent)}px` }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!occurrenceId || event.currentTarget !== event.target) return;
        if (event.key === ' ') {
          event.preventDefault();
          if (targetNodeId) editor.getTransforms(TanaZoomPlugin).zoom.to(targetNodeId);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          reference.editTarget(occurrenceId);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          reference.exitEditMode(occurrenceId);
        }
      }}
      onDoubleClick={() => occurrenceId && reference.editTarget(occurrenceId)}
    >
      <div className="flex items-center">
        {children.length > 0 && <button aria-label="展开引用子节点" aria-expanded={!!open}
          onClick={() => editor.getApi(TogglePlugin).toggle.toggleIds([String(element.id)], !open)}
          onKeyDown={(event) => event.stopPropagation()}>
          {open ? '▾' : '▸'}
        </button>}
        <div className="min-w-0 flex-1">
          <NodeProjection
            index={index}
            isEditing={isEditing}
            onEdit={() => occurrenceId && reference.editTarget(occurrenceId)}
            onExitEdit={() => occurrenceId && reference.exitEditMode(occurrenceId)}
            onRestore={() => occurrenceId && reference.restoreTarget(occurrenceId)}
            targetNodeId={occurrenceId}
            variant="block-reference"
          />
        </div>
        {targetNodeId && occurrenceId && <button
          aria-label="将引用节点移到这里"
          className="shrink-0 px-1 text-xs text-[var(--tana-text-tertiary)] hover:text-[var(--tana-link)]"
          title="将引用节点移到这里"
          type="button"
          onClick={() => reference.bringHere(occurrenceId)}
          onKeyDown={(event) => event.stopPropagation()}
        >
          ⇄
        </button>}
      </div>
      {rows.map(({ id, depth }) => <div key={id} style={{ marginLeft: depth * 20 }}>
        <NodeProjection index={index} targetNodeId={id} variant="block-reference" />
      </div>)}
    </div>
  );
}

function OutlineRenderer({ focusedNodeId, selectedNodeId }: TanaNodeWorkspaceRendererProps) {
  return <OutlineNodeView focusedNodeId={focusedNodeId} selectedNodeId={selectedNodeId} />;
}

function ViewRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  return node ? (
    <TanaView index={index} view={node} />
  ) : (
    <OutlineRenderer index={index} {...props} />
  );
}

/**
 * A Supertag Definition normally presents its derived instances. Its own
 * editable definition outline remains available through the inspector and
 * becomes the page only when an explicit View semantic takes precedence.
 */
function SupertagInstancesRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  if (!node) return <OutlineRenderer index={index} {...props} />;

  return <TanaSupertagPage index={index} node={node} />;
}

/** Field occurrence labels are derived from their Field Definition Node. */
function FieldRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const editor = useEditorRef();
  const fieldNodeId = typeof element.id === 'string' ? element.id : undefined;
  const fieldNode = fieldNodeId ? index.fieldNodesById.get(fieldNodeId) : undefined;
  const fieldId = fieldNode?.fieldId;
  const { baseIndent } = useTanaZoomPresentation();

  if (!fieldNode || typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);
  const indent = typeof element.indent === 'number' ? element.indent : 0;
  const labelLeft = `${getTanaDisplayIndentPx(indent, baseIndent)}px`;
  const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const pinned = (index.nodesById.get(fieldNode.parentNodeId)?.supertagIds ?? []).some(
    (supertagId) =>
      getSupertagTemplateFields(index, supertagId).some(
        (template) => template.fieldId === fieldId && template.pinned
      )
  );
  const canAddValue = field?.fieldDefinition?.cardinality === 'list';
  const validationIssues = [
    ...fieldNode.validationIssues,
    ...fieldNode.valueNodeIds.flatMap(
      (valueNodeId) => fieldNode.validationIssuesByValueNodeId.get(valueNodeId) ?? []
    ),
  ];
  const validationLabel = getFieldValidationLabel(validationIssues);

  return (
    <div
      className="tana-fieldChrome absolute top-0 z-20 flex h-7 items-center"
      contentEditable={false}
      style={{ left: labelLeft, right: 0 }}
    >
      <button
        className="tana-fieldLabel pointer-events-auto shrink-0 truncate pr-1 text-left text-[13px] text-[var(--tana-text-secondary)] hover:text-[var(--tana-link)]"
        data-plate-prevent-deselect
        title="打开字段定义"
        type="button"
        style={{ width: `${TANA_FIELD_LABEL_PX}px` }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.getTransforms(TanaZoomPlugin).zoom.to(fieldId);
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {pinned && <PinIcon aria-label="已置顶" className="size-3 shrink-0" />}
          <span className="truncate">{field?.text || '未命名字段'}</span>
          {field?.fieldDefinition?.required && (
            <span aria-label="必填字段" className="shrink-0 text-destructive">*</span>
          )}
          {validationLabel && (
            <span
              aria-label={`字段值警告：${validationLabel}`}
              className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              id={`field-validation-${fieldNode.id}`}
              role="status"
              title={validationLabel}
            >
              需修正
            </span>
          )}
        </span>
      </button>

      <div className="tana-fieldActions pointer-events-auto ml-auto flex items-center gap-0.5 rounded-md bg-[var(--tana-canvas)]/95 p-0.5 opacity-0 shadow-[0_1px_4px_rgb(31_54_43/0.08)] transition-opacity">
        {canAddValue && (
          <FieldAction
            label="添加字段值"
            onClick={() => fieldTransforms.addValue(fieldNode.parentNodeId, fieldNode.fieldId)}
          >
            <PlusIcon />
          </FieldAction>
        )}
        <FieldAction
          label="在正文中隐藏"
          onClick={() => presentation.setFieldVisible(fieldNode.parentNodeId, fieldNode.id, false)}
        >
          <EyeOffIcon />
        </FieldAction>
      </div>
    </div>
  );
}

function FieldAction({
  children,
  label,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-link)] [&_svg]:size-3.5"
      data-plate-prevent-deselect
      title={label}
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * The Value remains a real Plate Node. Structured types receive a thin Tana
 * editor while plain and number text continue to use Plate contenteditable.
 */
function ValueRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const editor = useEditorRef();
  const nodeId = typeof element.id === 'string' ? element.id : undefined;

  if (!nodeId) return null;

  const fieldNode = Array.from(index.fieldNodesById.values()).find(
    (candidate) => candidate.valueNodeIds.includes(nodeId)
  );

  if (!fieldNode) return null;

  const definition = index.nodesById.get(fieldNode.fieldId)?.fieldDefinition;

  if (!definition) return null;

  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const currentFieldValue = fieldNode.valueByNodeId.get(nodeId);
  const validationIssues = fieldNode.validationIssuesByValueNodeId.get(nodeId) ?? [];
  const validationLabel = getFieldValidationLabel(validationIssues);
  const warningId = `field-value-warning-${nodeId}`;
  const setValue = (value: FieldValue) =>
    definition.cardinality === 'list'
      ? fieldTransforms.setValueAt(fieldNode.parentNodeId, fieldNode.fieldId, nodeId, value)
      : fieldTransforms.setValue(fieldNode.parentNodeId, fieldNode.fieldId, value);
  const clearValue = () =>
    definition.cardinality === 'list'
      ? fieldTransforms.removeValue(fieldNode.parentNodeId, fieldNode.fieldId, nodeId)
      : fieldTransforms.clearValue(fieldNode.parentNodeId, fieldNode.fieldId);

  if (
    definition.type === 'plain' ||
    definition.type === 'number' ||
    definition.type === 'email' ||
    definition.type === 'url'
  ) {
    const text = index.nodesById.get(nodeId)?.text;

    return text ? null : <UnsetValuePlaceholder />;
  }

  if (definition.type === 'checkbox') {
    const value = currentFieldValue?.type === 'checkbox' ? currentFieldValue.value : undefined;

    return (
      <ValueControl>
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-1.5 text-[13px] text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)]">
          <Checkbox
            aria-label={`${index.nodesById.get(fieldNode.fieldId)?.text || '字段'}字段值`}
            aria-describedby={validationLabel ? warningId : undefined}
            aria-invalid={validationLabel ? true : undefined}
            checked={value ?? false}
            data-plate-prevent-deselect
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') {
                setValue({ type: 'checkbox', value: checked });
              }
            }}
          />
          <span>{value === undefined ? '未设置' : value ? '已完成' : '未完成'}</span>
        </label>
        {(value !== undefined || definition.cardinality === 'list') && (
          <ValueClearButton onClear={clearValue} />
        )}
        <FieldValueWarning id={warningId} label={validationLabel} />
      </ValueControl>
    );
  }

  if (definition.type === 'date') {
    const value = currentFieldValue?.type === 'date' ? currentFieldValue.value : '';

    return (
      <ValueControl>
        <input
          aria-label="日期字段值"
          aria-describedby={validationLabel ? warningId : undefined}
          aria-invalid={validationLabel ? true : undefined}
          className="h-7 rounded border-0 bg-transparent px-1.5 text-[13px] text-[var(--tana-text-secondary)] outline-none hover:bg-[var(--tana-hover)] focus:bg-[var(--tana-canvas)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]"
          data-plate-prevent-deselect
          type="date"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;

            if (nextValue) {
              setValue({ type: 'date', value: nextValue });
            } else {
              clearValue();
            }
          }}
        />
        <FieldValueWarning id={warningId} label={validationLabel} />
      </ValueControl>
    );
  }

  const currentValue =
    currentFieldValue?.type === definition.type ? currentFieldValue.value : undefined;
  const candidates = getFieldValueCandidates(index, fieldNode.fieldId);

  return (
    <ValueControl>
      <Select
        value={currentValue}
        onValueChange={(value) =>
          setValue({
            type: definition.type,
            value
          } as Extract<FieldValue, { type: 'from-supertag' | 'options' }>)
        }
      >
        <SelectTrigger
          aria-label={`${index.nodesById.get(fieldNode.fieldId)?.text || '字段'}字段值`}
          aria-describedby={validationLabel ? warningId : undefined}
          aria-invalid={validationLabel ? true : undefined}
          className="h-7 max-w-56 border-0 bg-transparent px-1.5 text-[13px] shadow-none hover:bg-[var(--tana-hover)] focus:ring-1"
          data-plate-prevent-deselect
        >
          <SelectValue placeholder="未设置" />
        </SelectTrigger>
        <SelectContent align="start">
          {candidates.length === 0 ? (
            <div className="px-2 py-2 text-muted-foreground text-xs">暂无可选节点</div>
          ) : (
            candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {(currentValue || definition.cardinality === 'list') && (
        <ValueClearButton onClear={clearValue} />
      )}
      {definition.type === 'options' && (
        <CreateOptionControl
          fieldId={fieldNode.fieldId}
          nodeId={fieldNode.parentNodeId}
          valueNodeId={nodeId}
        />
      )}
      <FieldValueWarning id={warningId} label={validationLabel} />
    </ValueControl>
  );
}

function FieldValueWarning({ id, label }: { id: string; label: string }) {
  return label ? (
    <span id={id} role="status" className="ml-1 text-[11px] text-amber-700 dark:text-amber-300">
      {label}
    </span>
  ) : null;
}

function CreateOptionControl({
  fieldId,
  nodeId,
  valueNodeId,
}: {
  fieldId: NodeId;
  nodeId: NodeId;
  valueNodeId: NodeId;
}) {
  const editor = useEditorRef();
  const [name, setName] = React.useState('');

  const create = () => {
    if (
      editor
        .getTransforms(TanaFieldPlugin)
        .field.createOptionAndAssign(nodeId, fieldId, name, valueNodeId)
    ) {
      setName('');
    }
  };

  return (
    <span className="ml-1 flex items-center gap-1">
      <input
        aria-label="新建选项"
        className="h-6 w-24 rounded border border-[var(--tana-divider)] bg-transparent px-1 text-xs"
        data-plate-prevent-deselect
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            create();
          }
        }}
      />
      <button
        aria-label="创建并选择新选项"
        className="rounded px-1 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)] disabled:opacity-50"
        data-plate-prevent-deselect
        disabled={name.trim().length === 0}
        type="button"
        onClick={create}
      >
        新建
      </button>
    </span>
  );
}

function ValueClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      aria-label="清空字段值"
      className="grid size-6 shrink-0 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-[var(--tana-link)]"
      data-plate-prevent-deselect
      title="清空字段值"
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

function ValueControl({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="tana-valueControl absolute top-0 right-4 z-10 flex h-7 items-center"
      contentEditable={false}
      data-plate-prevent-deselect
      style={{ left: 'var(--tana-field-value-offset)' }}
    >
      {children}
    </div>
  );
}

function UnsetValuePlaceholder() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 z-10 flex h-7 items-center text-[var(--tana-text-tertiary)] text-[13px] opacity-80"
      contentEditable={false}
      style={{ left: 'var(--tana-field-value-offset)' }}
    >
      未设置
    </span>
  );
}

/**
 * The registry selects presentation only. It owns neither document mutation
 * nor editor interaction state; both remain in Plate and semantic plugins.
 */
export const NodeRendererRegistry: Record<TanaNodeSemanticType, TanaNodeRenderer> = {
  content: { Workspace: OutlineRenderer },
  'field-definition': { Workspace: OutlineRenderer },
  field: { Block: FieldRenderer, Workspace: OutlineRenderer },
  option: { Workspace: OutlineRenderer },
  reference: { Block: ReferenceRenderer, Workspace: OutlineRenderer },
  search: { Workspace: ViewRenderer },
  'supertag-definition': {
    Workspace: SupertagInstancesRenderer
  },
  value: { Block: ValueRenderer, Workspace: OutlineRenderer },
  view: { Workspace: ViewRenderer }
};

export function getNodeRenderer(semanticType: TanaNodeSemanticType): TanaNodeRenderer {
  return NodeRendererRegistry[semanticType];
}
