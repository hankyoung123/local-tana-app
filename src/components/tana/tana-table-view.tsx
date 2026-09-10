'use client';

import * as React from 'react';
import {
  ArrowDownAZIcon,
  Columns3Icon,
  RotateCcwIcon,
} from 'lucide-react';
import { useEditorRef, type PlateEditor } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getFieldValueCandidates,
  getSupertagTemplateFields,
  isTanaTitleExpressionNameEditable,
  getTanaProjectionTarget,
  sortTanaViewProjectionItems,
  isTanaNodeInTrash,
  resolveTanaNodeTitle,
  resolveTanaNodeTitleSegments,
  type FieldDefinition,
  type FieldValidationIssue,
  type FieldValue,
  type NodeId,
  type TanaFieldNode,
  type TanaIndex,
  type TanaNode,
  type TanaViewDefinition,
  type TanaViewProjection,
} from '@/lib/tana';

import { getProjectionEditableTitle, ProjectionTitleInput } from './node-projection';
import { TanaNodeBullet } from './tana-node-gutter';
import { createTanaViewNode } from './tana-view-actions';

const TITLE_SORT = '$title';

type TanaTableSort = NonNullable<TanaViewDefinition['sort']>;

type ScalarDefinition = Exclude<
  FieldDefinition,
  { type: 'from-supertag' | 'options' }
>;

function getConfiguredTanaTableFieldIds(
  settings: TanaViewDefinition | undefined
): NodeId[] {
  const configured = [...(settings?.visibleFieldIds ?? [])];

  settings?.sort?.forEach(({ fieldId }) => {
    if (fieldId !== TITLE_SORT) configured.push(fieldId);
  });

  return configured;
}

function getField(index: TanaIndex, nodeId: NodeId, fieldId: NodeId) {
  const target = getTanaProjectionTarget(index, nodeId);

  return (target ? index.fieldNodesByParent.get(target.id) ?? [] : []).find(
    (candidate) => candidate.fieldId === fieldId
  );
}

const fieldValidationLabels: Record<FieldValidationIssue, string> = {
  'incompatible-type': '字段类型已变更，保留原值',
  'invalid-checkbox': '复选框值无效',
  'invalid-date': '日期格式无效',
  'invalid-email': '邮箱格式无效',
  'invalid-number': '数字或范围无效',
  'invalid-option': '当前选项不可用',
  'invalid-url': '网址无效',
  'missing-reference': '关联节点不可用',
  'missing-required': '此字段为必填项',
};

function getFieldValidationLabel(field: TanaFieldNode | undefined): string {
  if (!field) return '';

  const issues = [
    ...field.validationIssues,
    ...field.valueNodeIds.flatMap(
      (valueNodeId) => field.validationIssuesByValueNodeId.get(valueNodeId) ?? []
    ),
  ];

  return Array.from(new Set(issues)).map((issue) => fieldValidationLabels[issue]).join('；');
}

/** Commits a real Table edit, materializing an absent optional Field on demand. */
export function setTanaTableFieldValue(
  editor: PlateEditor,
  nodeId: NodeId,
  fieldId: NodeId,
  value: FieldValue
): boolean {
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;

  if (!fieldTransforms.materialize(nodeId, fieldId)) return false;

  return fieldTransforms.setValue(nodeId, fieldId, value);
}

function getFieldValueLabel(
  index: TanaIndex,
  field: TanaFieldNode | undefined
): string {
  const labels = (field?.values ?? []).map((value) => {
    if (value.type === 'options' || value.type === 'from-supertag') {
      return resolveTanaNodeTitle(index, value.value);
    }

    return String(value.value);
  });

  return labels.join('、');
}

/** Derives columns from real Field occurrence Nodes, never a table row cache. */
export function getTanaTableFieldIds(
  index: TanaIndex,
  results: readonly TanaNode[]
): NodeId[] {
  return Array.from(
    new Set(
      results.flatMap((node) => {
        const target = getTanaProjectionTarget(index, node.id);

        return (target ? index.fieldNodesByParent.get(target.id) ?? [] : []).map(
          (field) => field.fieldId
        );
      })
    )
  );
}

/**
 * A Table may expose a configured Field before an instance materializes it.
 * The ordering remains document-derived: persisted columns first, then
 * Supertag template order in result order, then occurrence-only Fields.
 */
export function getTanaTableAvailableFieldIds(
  index: TanaIndex,
  results: readonly TanaNode[],
  configuredFieldIds: readonly NodeId[] = []
): NodeId[] {
  const available: NodeId[] = [];
  const seen = new Set<NodeId>();
  const add = (fieldId: NodeId) => {
    if (seen.has(fieldId) || !index.nodesById.get(fieldId)?.fieldDefinition) return;

    seen.add(fieldId);
    available.push(fieldId);
  };

  configuredFieldIds.forEach(add);

  for (const result of results) {
    const node = getTanaProjectionTarget(index, result.id);
    if (!node) continue;

    node.supertagIds.forEach((supertagId) => {
      getSupertagTemplateFields(index, supertagId).forEach((template) => add(template.fieldId));
    });
  }

  getTanaTableFieldIds(index, results).forEach(add);

  return available;
}

/** Sorting changes only this View's projection order; canonical Node order stays intact. */
export function sortTanaTableNodes(
  index: TanaIndex,
  nodes: readonly TanaNode[],
  sort: TanaTableSort | undefined
): TanaNode[] {
  if (!sort) return [...nodes];

  return sortTanaViewProjectionItems(
    index,
    nodes.flatMap((occurrence) => {
      const target = getTanaProjectionTarget(index, occurrence.id);
      return target ? [{ occurrence, target }] : [];
    }),
    { sort, type: 'table' }
  ).map(({ occurrence }) => occurrence);
}

/** Grouping derives labels from Field Nodes and never retains a result copy. */
export function groupTanaTableNodes(
  index: TanaIndex,
  nodes: readonly TanaNode[],
  fieldId: NodeId | undefined
): Array<{ label: string; nodes: TanaNode[] }> {
  if (!fieldId) return [{ label: '', nodes: [...nodes] }];

  const groups = new Map<string, TanaNode[]>();

  for (const node of nodes) {
    const label = getFieldValueLabel(index, getField(index, node.id, fieldId)) || '未设置';
    const group = groups.get(label) ?? [];

    group.push(node);
    groups.set(label, group);
  }

  return Array.from(groups, ([label, groupedNodes]) => ({
    label,
    nodes: groupedNodes,
  }));
}

function FieldCell({
  fieldId,
  index,
  nodeId,
}: {
  fieldId: NodeId;
  index: TanaIndex;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const field = getField(index, nodeId, fieldId);
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;
  const fieldLabel = index.nodesById.get(fieldId)?.text || '字段';

  if (field?.brokenFieldDefinition) {
    const inTrash = isTanaNodeInTrash(index, fieldId);

    return (
      <div className="flex min-w-28 items-center gap-1 text-xs text-muted-foreground" role="status">
        <span>{inTrash ? '字段定义已移至回收站' : '字段定义已删除'}</span>
        {inTrash && (
          <button
            aria-label="恢复字段定义"
            className="rounded px-1 text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() => editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(fieldId)}
          >
            恢复
          </button>
        )}
      </div>
    );
  }

  if (!definition) return <span className="text-muted-foreground">—</span>;

  const setValue = (value: FieldValue) =>
    setTanaTableFieldValue(editor, nodeId, fieldId, value);
  const clearValue = () =>
    field
      ? editor.getTransforms(TanaFieldPlugin).field.clearValue(nodeId, fieldId)
      : false;
  const warningLabel = getFieldValidationLabel(field);
  const warningId = `table-field-warning-${nodeId}-${fieldId}`;

  if (definition.cardinality === 'list' && field) {
    return (
      <ListFieldCell
        definition={definition}
        field={field}
        fieldId={fieldId}
        fieldLabel={fieldLabel}
        index={index}
        nodeId={nodeId}
        warningId={warningId}
        warningLabel={warningLabel}
      />
    );
  }

  if (definition.cardinality === 'list') {
    return (
      <button
        aria-label={`添加${fieldLabel}字段值`}
        className="rounded px-1.5 py-1 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
        type="button"
        onClick={() => editor.getTransforms(TanaFieldPlugin).field.addValue(nodeId, fieldId)}
      >
        添加值
      </button>
    );
  }

  if (definition.type === 'checkbox') {
    const value = field?.value?.type === 'checkbox' ? field.value.value : false;

    return (
      <div className="flex items-center gap-1">
        <Checkbox
          aria-describedby={warningLabel ? warningId : undefined}
          aria-invalid={warningLabel ? true : undefined}
          aria-label={`${fieldLabel}字段值`}
          checked={value}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') setValue({ type: 'checkbox', value: checked });
          }}
        />
        {field?.value && <ClearValueButton fieldLabel={fieldLabel} onClear={clearValue} />}
        <FieldWarning id={warningId} label={warningLabel} />
      </div>
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    const value = field?.value?.type === definition.type ? field.value.value : undefined;
    const candidates = getFieldValueCandidates(index, fieldId);

    return (
      <div className="flex items-center gap-1">
        <Select
          value={value}
          onValueChange={(candidateId) =>
            setValue({ type: definition.type, value: candidateId } as Extract<
              FieldValue,
              { type: 'options' | 'from-supertag' }
            >)
          }
        >
          <SelectTrigger
            aria-describedby={warningLabel ? warningId : undefined}
            aria-invalid={warningLabel ? true : undefined}
            className="h-7 min-w-28 border-0 bg-transparent px-1.5 text-xs shadow-none"
          >
            <SelectValue placeholder="未设置" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && <ClearValueButton fieldLabel={fieldLabel} onClear={clearValue} />}
        <FieldWarning id={warningId} label={warningLabel} />
      </div>
    );
  }

  const committedValue = field?.valueNodeId
    ? index.nodesById.get(field.valueNodeId)?.text ?? ''
    : '';

  return (
    <ScalarFieldCell
      key={committedValue}
      committedValue={committedValue}
      definition={definition}
      fieldLabel={fieldLabel}
      onClear={clearValue}
      onCommitRaw={(text) =>
        editor.getTransforms(TanaFieldPlugin).field.setRawScalarValue(nodeId, fieldId, text)
      }
      warningId={warningId}
      warningLabel={warningLabel}
    />
  );
}

function FieldWarning({ id, label }: { id: string; label: string }) {
  return label ? (
    <span className="text-[10px] text-amber-700 dark:text-amber-300" id={id} role="status">
      需修正：{label}
    </span>
  ) : null;
}

function ListFieldCell({
  definition,
  field,
  fieldId,
  fieldLabel,
  index,
  nodeId,
  warningId,
  warningLabel,
}: {
  definition: FieldDefinition;
  field: TanaFieldNode;
  fieldId: NodeId;
  fieldLabel: string;
  index: TanaIndex;
  nodeId: NodeId;
  warningId: string;
  warningLabel: string;
}) {
  const editor = useEditorRef();
  const transforms = editor.getTransforms(TanaFieldPlugin).field;
  const addValue = () => transforms.addValue(nodeId, fieldId);
  const removeValue = (valueNodeId: NodeId) =>
    transforms.removeValue(nodeId, fieldId, valueNodeId);

  return (
    <div className="flex min-w-36 flex-col items-start gap-1">
      {field.valueNodeIds.map((valueNodeId) => (
        <ListValueCell
          definition={definition}
          fieldId={fieldId}
          fieldLabel={fieldLabel}
          index={index}
          key={valueNodeId}
          nodeId={nodeId}
          onRemove={() => removeValue(valueNodeId)}
          valueNodeId={valueNodeId}
          warningId={`${warningId}-${valueNodeId}`}
        />
      ))}
      <div className="flex items-center gap-1">
        <button
          aria-label={`添加${fieldLabel}字段值`}
          className="rounded px-1 py-0.5 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
          type="button"
          onClick={addValue}
        >
          添加值
        </button>
        {field.valueNodeIds.length > 0 && (
          <ClearValueButton fieldLabel={fieldLabel} onClear={() => transforms.clearValue(nodeId, fieldId)} />
        )}
      </div>
      <FieldWarning id={warningId} label={warningLabel} />
    </div>
  );
}

function ListValueCell({
  definition,
  fieldId,
  fieldLabel,
  index,
  nodeId,
  onRemove,
  valueNodeId,
  warningId,
}: {
  definition: FieldDefinition;
  fieldId: NodeId;
  fieldLabel: string;
  index: TanaIndex;
  nodeId: NodeId;
  onRemove: () => boolean;
  valueNodeId: NodeId;
  warningId: string;
}) {
  const editor = useEditorRef();
  const field = getField(index, nodeId, fieldId);
  const value = field?.valueByNodeId.get(valueNodeId);
  const warningLabel = getFieldValidationLabelForValue(field, valueNodeId);
  const transforms = editor.getTransforms(TanaFieldPlugin).field;

  if (definition.type === 'checkbox') {
    return (
      <div className="flex items-center gap-1">
        <Checkbox
          aria-describedby={warningLabel ? warningId : undefined}
          aria-invalid={warningLabel ? true : undefined}
          aria-label={`${fieldLabel}字段值`}
          checked={value?.type === 'checkbox' ? value.value : false}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              transforms.setValueAt(nodeId, fieldId, valueNodeId, { type: 'checkbox', value: checked });
            }
          }}
        />
        <ClearValueButton fieldLabel={fieldLabel} onClear={onRemove} />
        <FieldWarning id={warningId} label={warningLabel} />
      </div>
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    const selected = value?.type === definition.type ? value.value : undefined;

    return (
      <div className="flex items-center gap-1">
        <Select
          value={selected}
          onValueChange={(candidateId) =>
            transforms.setValueAt(nodeId, fieldId, valueNodeId, {
              type: definition.type,
              value: candidateId,
            } as Extract<FieldValue, { type: 'options' | 'from-supertag' }>)
          }
        >
          <SelectTrigger
            aria-describedby={warningLabel ? warningId : undefined}
            aria-invalid={warningLabel ? true : undefined}
            className="h-7 min-w-28 border-0 bg-transparent px-1.5 text-xs shadow-none"
          >
            <SelectValue placeholder="未设置" />
          </SelectTrigger>
          <SelectContent>
            {getFieldValueCandidates(index, fieldId).map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ClearValueButton fieldLabel={fieldLabel} onClear={onRemove} />
        <FieldWarning id={warningId} label={warningLabel} />
      </div>
    );
  }

  return (
    <ScalarFieldCell
      committedValue={index.nodesById.get(valueNodeId)?.text ?? ''}
      definition={definition}
      fieldLabel={fieldLabel}
      onClear={onRemove}
      onCommitRaw={(text) => transforms.setRawScalarValue(nodeId, fieldId, text, valueNodeId)}
      warningId={warningId}
      warningLabel={warningLabel}
    />
  );
}

function getFieldValidationLabelForValue(field: TanaFieldNode | undefined, valueNodeId: NodeId) {
  const issues = field?.validationIssuesByValueNodeId.get(valueNodeId) ?? [];

  return Array.from(new Set(issues)).map((issue) => fieldValidationLabels[issue]).join('；');
}

function ClearValueButton({
  fieldLabel,
  onClear,
}: {
  fieldLabel: string;
  onClear: () => boolean;
}) {
  return (
    <button
      aria-label={`清除${fieldLabel}字段值`}
      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      type="button"
      onClick={onClear}
    >
      <RotateCcwIcon className="size-3" />
    </button>
  );
}

function ScalarFieldCell({
  committedValue,
  definition,
  fieldLabel,
  onClear,
  onCommitRaw,
  warningId,
  warningLabel,
}: {
  committedValue: string;
  definition: ScalarDefinition;
  fieldLabel: string;
  onClear: () => boolean;
  onCommitRaw: (text: string) => boolean;
  warningId: string;
  warningLabel: string;
}) {
  const [draft, setDraft] = React.useState(committedValue);
  const [invalid, setInvalid] = React.useState(false);

  const commit = () => {
    if (draft === '') {
      onClear();
      setInvalid(false);
      return;
    }

    setInvalid(!onCommitRaw(draft));
  };

  return (
    <div className="flex items-center gap-1">
      <input
        aria-describedby={warningLabel ? warningId : undefined}
        aria-invalid={invalid || Boolean(warningLabel) || undefined}
        aria-label={`${fieldLabel}字段值`}
        className="h-7 min-w-28 rounded bg-transparent px-1.5 text-xs outline-none hover:bg-[var(--tana-hover)] focus:bg-[var(--tana-canvas)] focus:ring-1 focus:ring-[var(--tana-accent-soft)] aria-invalid:ring-1 aria-invalid:ring-destructive"
        inputMode={definition.type === 'number' ? 'decimal' : undefined}
        placeholder={definition.type === 'date' ? 'YYYY-MM-DD' : undefined}
        type="text"
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(committedValue);
            setInvalid(false);
            event.currentTarget.blur();
          }
        }}
      />
      {committedValue && (
        <ClearValueButton
          fieldLabel={fieldLabel}
          onClear={() => {
            const cleared = onClear();

            setDraft('');
            setInvalid(false);
            return cleared;
          }}
        />
      )}
      <FieldWarning id={warningId} label={warningLabel} />
    </div>
  );
}

/** A table row is a canonical Node projection, never a table-specific copy. */
function TableRow({
  fieldIds,
  index,
  node,
  viewId,
}: {
  fieldIds: readonly NodeId[];
  index: TanaIndex;
  node: TanaNode;
  viewId: NodeId;
}) {
  const editor = useEditorRef();
  const target = getTanaProjectionTarget(index, node.id);

  if (!target) return null;

  const displayTitle = resolveTanaNodeTitle(index, target.id);
  const displaySegments = resolveTanaNodeTitleSegments(index, target.id);
  const editableTitle = getProjectionEditableTitle(target);

  return (
    <tr className="tana-projectionRow border-b border-[var(--tana-divider)] last:border-0 hover:bg-[var(--tana-hover)]">
      <td className="min-w-56 px-1.5 py-1 align-middle">
        <div className="flex items-center gap-1.5">
          <button
            aria-label={`打开 ${displayTitle || '未命名节点'}`}
            className="grid size-5 shrink-0 place-items-center rounded text-[var(--tana-node-bullet)] hover:bg-[var(--tana-accent-soft)] hover:text-[var(--tana-accent)]"
            title="打开节点"
            type="button"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(target.id)}
          >
            <TanaNodeBullet compact semanticType={node.semanticType} />
          </button>
          <ProjectionTitleInput
            displayTitle={displayTitle}
            displaySegments={node.titleExpression ? displaySegments : undefined}
            readOnly={
              node.titleExpression !== undefined &&
              !isTanaTitleExpressionNameEditable(node.titleExpression)
            }
            targetNodeId={target.id}
            title={editableTitle}
            onEnter={() => createTanaViewNode(editor, viewId)}
          />
        </div>
      </td>
      {fieldIds.map((fieldId) => (
        <td key={fieldId} className="min-w-32 px-1.5 py-1 align-middle text-xs">
          <FieldCell fieldId={fieldId} index={index} nodeId={node.id} />
        </td>
      ))}
    </tr>
  );
}

export function TanaTableView({
  index,
  projection,
  results,
  view,
}: {
  index: TanaIndex;
  projection?: TanaViewProjection;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const viewSettings = view.viewDefinition;
  const configuredVisibleFieldIds = viewSettings?.visibleFieldIds;
  const fieldIds = projection?.availableFieldIds ?? getTanaTableAvailableFieldIds(
    index,
    results,
    getConfiguredTanaTableFieldIds(viewSettings)
  );
  const visibleFields = projection?.visibleFieldIds ?? (configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds);
  const fieldName = (fieldId: NodeId) => index.nodesById.get(fieldId)?.text || '未命名字段';

  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
        <table className="tana-projectionTable min-w-full border-collapse">
          <thead className="border-b border-[var(--tana-divider)] text-left text-[var(--tana-text-tertiary)] text-xs">
            <tr>
              <th className="px-1.5 py-1 font-medium">Title</th>
              {visibleFields.map((fieldId, position) => (
                <th key={fieldId} className="px-1.5 py-1 font-medium">
                  <span className="inline-flex items-center gap-1">
                    {fieldName(fieldId)}
                    <button
                      aria-label={`左移 ${fieldName(fieldId)} 列`}
                      className="text-[10px] disabled:opacity-30"
                      disabled={position === 0}
                      type="button"
                      onClick={() => {
                        const next = [...visibleFields];
                        [next[position - 1], next[position]] = [next[position], next[position - 1]];
                        editor.getTransforms(TanaViewPlugin).view.update(view.id, { visibleFieldIds: next });
                      }}
                    >←</button>
                    <button
                      aria-label={`右移 ${fieldName(fieldId)} 列`}
                      className="text-[10px] disabled:opacity-30"
                      disabled={position + 1 === visibleFields.length}
                      type="button"
                      onClick={() => {
                        const next = [...visibleFields];
                        [next[position], next[position + 1]] = [next[position + 1], next[position]];
                        editor.getTransforms(TanaViewPlugin).view.update(view.id, { visibleFieldIds: next });
                      }}
                    >→</button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td
                  className="px-1.5 py-8 text-center text-[var(--tana-text-tertiary)] text-xs"
                  colSpan={visibleFields.length + 1}
                >
                  没有匹配的节点
                </td>
              </tr>
            ) : (
              results.map((node) => (
                <TableRow
                  key={node.id}
                  fieldIds={visibleFields}
                  index={index}
                  node={node}
                  viewId={view.id}
                />
              ))
            )}
            <tr>
              <td className="px-1.5 py-2" colSpan={visibleFields.length + 1}>
                <button
                  className="rounded px-1 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
                  type="button"
                  onClick={() => createTanaViewNode(editor, view.id)}
                >
                  添加行
                </button>
              </td>
            </tr>
          </tbody>
        </table>
    </div>
  );
}

/** Shared View chrome renders these controls; this component owns no result data. */
export function TanaTableToolbarControls({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const configuredVisibleFieldIds = view.viewDefinition?.visibleFieldIds;
  const fieldIds = getTanaTableAvailableFieldIds(
    index,
    results,
    getConfiguredTanaTableFieldIds(view.viewDefinition)
  );
  const configuredSort = view.viewDefinition?.sort ?? [];
  const visibleFields = configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds;
  const activeSort = configuredSort[0];
  const fieldName = (fieldId: NodeId) =>
    index.nodesById.get(fieldId)?.text || '未命名字段';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="选择表格字段列"
            className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[var(--tana-text-secondary)] text-xs hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)]"
            type="button"
          >
            <Columns3Icon className="size-3.5" />
            显示
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>显示字段</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {fieldIds.length === 0 ? (
            <DropdownMenuItem disabled>当前结果没有字段</DropdownMenuItem>
          ) : (
            fieldIds.map((fieldId) => (
              <DropdownMenuCheckboxItem
                key={fieldId}
                checked={visibleFields.includes(fieldId)}
                onCheckedChange={(checked) => {
                  const nextVisibleFieldIds = new Set(
                    configuredVisibleFieldIds ?? fieldIds
                  );

                  if (checked) nextVisibleFieldIds.add(fieldId);
                  else nextVisibleFieldIds.delete(fieldId);

                  editor.getTransforms(TanaViewPlugin).view.update(view.id, {
                    visibleFieldIds: fieldIds.filter((candidateId) =>
                      nextVisibleFieldIds.has(candidateId)
                    ),
                  });
                }}
              >
                {fieldName(fieldId)}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="添加表格字段列" className="inline-flex h-7 items-center rounded px-2 text-xs hover:bg-[var(--tana-hover)]" type="button">添加列</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>添加已有字段</DropdownMenuLabel>
          {Array.from(index.nodesById.values()).filter((node) => node.fieldDefinition).map((field) => (
            <DropdownMenuItem key={field.id} onSelect={() => editor.getTransforms(TanaViewPlugin).view.update(view.id, {
              visibleFieldIds: visibleFields.includes(field.id) ? [...visibleFields] : [...visibleFields, field.id],
            })}>{field.text || '未命名字段'}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => {
            const fieldId = editor.getTransforms(TanaFieldPlugin).field.createDefinition('新字段', { type: 'plain' });
            if (fieldId) editor.getTransforms(TanaViewPlugin).view.update(view.id, { visibleFieldIds: [...visibleFields, fieldId] });
          }}>创建字段定义</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Select
        value={activeSort ? `${activeSort.fieldId}:${activeSort.direction}` : undefined}
        onValueChange={(value) => {
          if (value === '__none__') {
            editor.getTransforms(TanaViewPlugin).view.update(view.id, { sort: undefined });
            return;
          }
          const [fieldId, direction] = value.split(':');

          if ((direction === 'asc' || direction === 'desc') && fieldId) {
            editor.getTransforms(TanaViewPlugin).view.update(view.id, {
              sort: [{
                direction,
                fieldId: fieldId === TITLE_SORT ? TITLE_SORT : (fieldId as NodeId),
              }],
            });
          }
        }}
      >
        <SelectTrigger aria-label="排序表格结果" className="h-7 w-30 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-[var(--tana-hover)]">
          <ArrowDownAZIcon className="size-3.5" />
          <SelectValue placeholder="排序" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">文档顺序</SelectItem>
          <SelectItem value={`${TITLE_SORT}:asc`}>标题 A → Z</SelectItem>
          <SelectItem value={`${TITLE_SORT}:desc`}>标题 Z → A</SelectItem>
          {fieldIds.map((fieldId) => (
            <React.Fragment key={fieldId}>
              <SelectItem value={`${fieldId}:asc`}>{fieldName(fieldId)} ↑</SelectItem>
              <SelectItem value={`${fieldId}:desc`}>{fieldName(fieldId)} ↓</SelectItem>
            </React.Fragment>
          ))}
        </SelectContent>
      </Select>
      <Select
        value="__add__"
        onValueChange={(value) => {
          if (value === '__add__') return;
          const [fieldId, direction] = value.split(':');
          if ((direction !== 'asc' && direction !== 'desc') || !fieldId) return;
          const criterion = {
            direction,
            fieldId: fieldId === TITLE_SORT ? TITLE_SORT : fieldId as NodeId,
          } as const;
          const withoutSameField = configuredSort.filter((current) => current.fieldId !== criterion.fieldId);
          editor.getTransforms(TanaViewPlugin).view.update(view.id, { sort: [...withoutSameField, criterion] });
        }}
      >
        <SelectTrigger aria-label="添加排序条件" className="h-7 w-24 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-[var(--tana-hover)]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__add__">添加排序</SelectItem>
          <SelectItem value={`${TITLE_SORT}:asc`}>标题 A → Z</SelectItem>
          <SelectItem value={`${TITLE_SORT}:desc`}>标题 Z → A</SelectItem>
          {fieldIds.map((fieldId) => <React.Fragment key={fieldId}>
            <SelectItem value={`${fieldId}:asc`}>{fieldName(fieldId)} ↑</SelectItem>
            <SelectItem value={`${fieldId}:desc`}>{fieldName(fieldId)} ↓</SelectItem>
          </React.Fragment>)}
        </SelectContent>
      </Select>
    </>
  );
}
