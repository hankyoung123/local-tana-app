'use client';

import * as React from 'react';
import {
  ArrowDownAZIcon,
  ArrowUpRightIcon,
  Columns3Icon,
  GroupIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useEditorRef, type PlateEditor } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
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
  resolveTanaNodeTitle,
  type FieldDefinition,
  type FieldValue,
  type NodeId,
  type TanaFieldNode,
  type TanaIndex,
  type TanaNode,
  type TanaViewDefinition,
} from '@/lib/tana';

import { getProjectionEditableTitle, ProjectionTitleInput } from './node-projection';

const NO_GROUP = '__no-group__';
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

  if (settings?.sort?.fieldId && settings.sort.fieldId !== TITLE_SORT) {
    configured.push(settings.sort.fieldId);
  }
  if (settings?.groupFieldId) configured.push(settings.groupFieldId);

  return configured;
}

function getField(index: TanaIndex, nodeId: NodeId, fieldId: NodeId) {
  return (index.fieldNodesByParent.get(nodeId) ?? []).find(
    (candidate) => candidate.fieldId === fieldId
  );
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
      results.flatMap((node) =>
        (index.fieldNodesByParent.get(node.id) ?? []).map((field) => field.fieldId)
      )
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

  for (const node of results) {
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

  const direction = sort.direction === 'asc' ? 1 : -1;
  const valueFor = (node: TanaNode) =>
    sort.fieldId === TITLE_SORT
      ? resolveTanaNodeTitle(index, node.id)
      : getFieldValueLabel(index, getField(index, node.id, sort.fieldId));

  return [...nodes].sort(
    (left, right) =>
      valueFor(left).localeCompare(valueFor(right), undefined, {
        numeric: true,
        sensitivity: 'base',
      }) * direction
  );
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

  if (!definition) return <span className="text-muted-foreground">—</span>;

  const setValue = (value: FieldValue) =>
    setTanaTableFieldValue(editor, nodeId, fieldId, value);
  const clearValue = () =>
    field
      ? editor.getTransforms(TanaFieldPlugin).field.clearValue(nodeId, fieldId)
      : false;

  if (definition.cardinality === 'list' && field) {
    const label = getFieldValueLabel(index, field);

    return (
      <div className="flex min-w-28 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs">{label || '未设置'}</span>
        {(field?.values.length ?? 0) > 0 && (
          <ClearValueButton fieldLabel={fieldLabel} onClear={clearValue} />
        )}
      </div>
    );
  }

  if (definition.type === 'checkbox') {
    const value = field?.value?.type === 'checkbox' ? field.value.value : false;

    return (
      <div className="flex items-center gap-1">
        <Checkbox
          aria-label={`${fieldLabel}字段值`}
          checked={value}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') setValue({ type: 'checkbox', value: checked });
          }}
        />
        {field?.value && <ClearValueButton fieldLabel={fieldLabel} onClear={clearValue} />}
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
          <SelectTrigger className="h-7 min-w-28 border-0 bg-transparent px-1.5 text-xs shadow-none">
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
      </div>
    );
  }

  const committedValue =
    field?.value?.type === definition.type ? String(field.value.value) : '';

  return (
    <ScalarFieldCell
      key={committedValue}
      committedValue={committedValue}
      definition={definition}
      fieldLabel={fieldLabel}
      onClear={clearValue}
      onCommit={setValue}
    />
  );
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
  onCommit,
}: {
  committedValue: string;
  definition: ScalarDefinition;
  fieldLabel: string;
  onClear: () => boolean;
  onCommit: (value: FieldValue) => boolean;
}) {
  const [draft, setDraft] = React.useState(committedValue);
  const [invalid, setInvalid] = React.useState(false);

  const commit = () => {
    if (draft === '') {
      onClear();
      setInvalid(false);
      return;
    }

    let next: FieldValue;

    switch (definition.type) {
      case 'number': {
        const number = Number(draft);

        if (!Number.isFinite(number)) {
          setInvalid(true);
          return;
        }
        next = { type: 'number', value: number };
        break;
      }
      case 'date':
        next = { type: 'date', value: draft };
        break;
      case 'email':
        next = { type: 'email', value: draft };
        break;
      case 'url':
        next = { type: 'url', value: draft };
        break;
      case 'checkbox':
        return;
      default:
        next = { type: 'plain', value: draft };
    }

    setInvalid(!onCommit(next));
  };

  const inputType =
    definition.type === 'number'
      ? 'number'
      : definition.type === 'date'
        ? 'date'
        : definition.type === 'email'
          ? 'email'
          : definition.type === 'url'
            ? 'url'
            : 'text';

  return (
    <div className="flex items-center gap-1">
      <input
        aria-invalid={invalid || undefined}
        aria-label={`${fieldLabel}字段值`}
        className="h-7 min-w-28 rounded bg-transparent px-1.5 text-xs outline-none hover:bg-muted/60 focus:bg-white focus:ring-1 focus:ring-[#8bb69b] aria-invalid:ring-1 aria-invalid:ring-destructive"
        type={inputType}
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
    </div>
  );
}

/** A table row is a canonical Node projection, never a table-specific copy. */
function TableRow({
  fieldIds,
  index,
  node,
}: {
  fieldIds: readonly NodeId[];
  index: TanaIndex;
  node: TanaNode;
}) {
  const editor = useEditorRef();
  const displayTitle = resolveTanaNodeTitle(index, node.id);
  const editableTitle = getProjectionEditableTitle(node);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="min-w-56 px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5">
          <button
            aria-label={`打开 ${displayTitle || '未命名节点'}`}
            className="shrink-0 text-muted-foreground"
            type="button"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
          >
            <ArrowUpRightIcon className="size-3.5" />
          </button>
          <ProjectionTitleInput
            displayTitle={displayTitle}
            readOnly={node.titleExpression !== undefined}
            targetNodeId={node.id}
            title={editableTitle}
          />
        </div>
      </td>
      {fieldIds.map((fieldId) => (
        <td key={fieldId} className="min-w-32 px-3 py-2 align-middle text-xs">
          <FieldCell fieldId={fieldId} index={index} nodeId={node.id} />
        </td>
      ))}
    </tr>
  );
}

export function TanaTableView({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const viewSettings = view.viewDefinition;
  const configuredVisibleFieldIds = viewSettings?.visibleFieldIds;
  const fieldIds = getTanaTableAvailableFieldIds(
    index,
    results,
    getConfiguredTanaTableFieldIds(viewSettings)
  );
  const configuredSort = viewSettings?.sort;
  const configuredGroupFieldId = viewSettings?.groupFieldId;
  const visibleFields = configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds;
  const activeSort =
    configuredSort &&
    configuredSort.fieldId !== TITLE_SORT &&
    !fieldIds.includes(configuredSort.fieldId)
      ? undefined
      : configuredSort;
  const activeGroupFieldId =
    configuredGroupFieldId && fieldIds.includes(configuredGroupFieldId)
      ? configuredGroupFieldId
      : undefined;
  const sortedResults = sortTanaTableNodes(index, results, activeSort);
  const groups = groupTanaTableNodes(index, sortedResults, activeGroupFieldId);
  const fieldName = (fieldId: NodeId) => index.nodesById.get(fieldId)?.text || '未命名字段';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full border-collapse">
          <thead className="bg-muted/30 text-left text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">节点</th>
              {visibleFields.map((fieldId) => (
                <th key={fieldId} className="px-3 py-2 font-medium">
                  {fieldName(fieldId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-muted-foreground text-xs"
                  colSpan={visibleFields.length + 1}
                >
                  没有匹配的节点
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <React.Fragment key={group.label || '__all__'}>
                  {activeGroupFieldId && (
                    <tr className="border-y bg-muted/20 text-muted-foreground text-xs">
                      <th
                        className="px-3 py-1.5 text-left font-medium"
                        colSpan={visibleFields.length + 1}
                      >
                        {group.label} · {group.nodes.length}
                      </th>
                    </tr>
                  )}
                  {group.nodes.map((node) => (
                    <TableRow
                      key={node.id}
                      fieldIds={visibleFields}
                      index={index}
                      node={node}
                    />
                  ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
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
  const configuredSort = view.viewDefinition?.sort;
  const configuredGroupFieldId = view.viewDefinition?.groupFieldId;
  const visibleFields = configuredVisibleFieldIds
    ? fieldIds.filter((fieldId) => configuredVisibleFieldIds.includes(fieldId))
    : fieldIds;
  const activeSort =
    configuredSort &&
    configuredSort.fieldId !== TITLE_SORT &&
    !fieldIds.includes(configuredSort.fieldId)
      ? undefined
      : configuredSort;
  const activeGroupFieldId =
    configuredGroupFieldId && fieldIds.includes(configuredGroupFieldId)
      ? configuredGroupFieldId
      : undefined;
  const fieldName = (fieldId: NodeId) =>
    index.nodesById.get(fieldId)?.text || '未命名字段';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="选择表格字段列"
            className="inline-flex h-8 items-center gap-1.5 rounded border bg-white px-2 text-xs hover:bg-muted"
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
              sort: {
                direction,
                fieldId: fieldId === TITLE_SORT ? TITLE_SORT : (fieldId as NodeId),
              },
            });
          }
        }}
      >
        <SelectTrigger aria-label="排序表格结果" className="h-8 w-32 bg-white text-xs shadow-none">
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
        value={activeGroupFieldId ?? NO_GROUP}
        onValueChange={(value) =>
          editor.getTransforms(TanaViewPlugin).view.update(view.id, {
            groupFieldId: value === NO_GROUP ? undefined : value,
          })
        }
      >
        <SelectTrigger aria-label="按字段分组" className="h-8 w-32 bg-white text-xs shadow-none">
          <GroupIcon className="size-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_GROUP}>不分组</SelectItem>
          {fieldIds.map((fieldId) => (
            <SelectItem key={fieldId} value={fieldId}>
              按{fieldName(fieldId)}分组
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
