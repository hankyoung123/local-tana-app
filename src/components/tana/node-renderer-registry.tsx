'use client';

import {
  CircleXIcon,
  ArrowUpRightIcon,
  EyeOffIcon,
  HashIcon,
  ListFilterIcon,
  PencilLineIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import type { TElement } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  FieldValue,
  NodeId,
  TanaIndex,
  TanaNode,
  TanaNodeSemanticType,
} from '@/lib/tana';
import { getFieldValueCandidates, getSupertagTemplateFields } from '@/lib/tana';

import { OutlineNodeView } from './outline-node-view';
import { TanaView } from './tana-view';

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

function NodeSemanticHint({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1 right-1 z-10 flex items-center gap-1 rounded-full bg-[#f1f4f2] px-1.5 py-0.5 text-[#87918b] text-[9px] opacity-0 transition-opacity group-hover:opacity-100 [&_svg]:size-2.5"
      contentEditable={false}
    >
      {icon}
      {label}
    </span>
  );
}

function FieldDefinitionHint({ element }: TanaNodeBlockRendererProps) {
  const definition = (element as TElement & {
    tanaFieldDefinition?: { type?: string };
  }).tanaFieldDefinition;

  return (
    <NodeSemanticHint
      icon={<SlidersHorizontalIcon />}
      label={definition?.type ? `字段 · ${definition.type}` : '字段定义'}
    />
  );
}

function OptionHint() {
  return <NodeSemanticHint label="选项" />;
}

function SupertagHint() {
  return <NodeSemanticHint icon={<HashIcon />} label="超级标签" />;
}

function ViewHint() {
  return <NodeSemanticHint icon={<ListFilterIcon />} label="视图" />;
}

function OutlineRenderer({
  focusedNodeId,
  selectedNodeId,
}: TanaNodeWorkspaceRendererProps) {
  return (
    <OutlineNodeView
      focusedNodeId={focusedNodeId}
      selectedNodeId={selectedNodeId}
    />
  );
}

function ViewRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  return node ? (
    <TanaView index={index} view={node} />
  ) : (
    <OutlineRenderer index={index} {...props} />
  );
}

function SupertagRenderer({ index, node, ...props }: TanaNodeWorkspaceRendererProps) {
  return node ? (
    <SupertagInstances definition={node} index={index} />
  ) : (
    <OutlineRenderer index={index} {...props} />
  );
}

/** Field occurrence labels are derived from their Field Definition Node. */
function FieldRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const editor = useEditorRef();
  const fieldNodeId = typeof element.id === 'string' ? element.id : undefined;
  const fieldNode = fieldNodeId
    ? index.fieldNodesById.get(fieldNodeId)
    : undefined;
  const fieldId = fieldNode?.fieldId;

  if (!fieldNode || typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);
  const indent = typeof element.indent === 'number' ? element.indent : 0;
  const labelLeft = `${indent * 24}px`;
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;

  return (
    <div
      className="tana-fieldChrome absolute inset-y-0 z-20 flex items-center"
      contentEditable={false}
      style={{ left: labelLeft, right: 0 }}
    >
      <button
        className="tana-fieldLabel pointer-events-auto w-28 shrink-0 truncate text-left text-[13px] text-[#527664] hover:text-[#1f6f52]"
        data-plate-prevent-deselect
        title="打开字段定义"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.getTransforms(TanaZoomPlugin).zoom.to(fieldId);
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {field?.text || '未命名字段'}
      </button>

      <div className="tana-fieldActions pointer-events-auto ml-auto flex items-center gap-0.5 rounded-md bg-white/95 p-0.5 opacity-0 shadow-[0_1px_4px_rgb(31_54_43/0.08)] transition-opacity">
        <FieldAction
          label="编辑字段值"
          onClick={() => {
            if (fieldNode.valueNodeId) {
              editor.getApi(TanaZoomPlugin).zoom.focus(fieldNode.valueNodeId);
            }
          }}
        >
          <PencilLineIcon />
        </FieldAction>
        <FieldAction
          label="清空字段值"
          onClick={() => fieldTransforms.clearValue(fieldNode.parentNodeId, fieldId)}
        >
          <CircleXIcon />
        </FieldAction>
        <FieldAction
          label="在正文中隐藏"
          onClick={() =>
            presentation.setFieldVisible(
              fieldNode.parentNodeId,
              fieldNode.id,
              false
            )
          }
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
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-6 place-items-center rounded text-[#89918b] hover:bg-[#edf3ef] hover:text-[#275d48] [&_svg]:size-3.5"
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
 * editor while plain text continues to use Plate's native contenteditable.
 */
function ValueRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const editor = useEditorRef();
  const nodeId = typeof element.id === 'string' ? element.id : undefined;

  if (!nodeId) return null;

  const fieldNode = Array.from(index.fieldNodesById.values()).find(
    (candidate) => candidate.valueNodeId === nodeId
  );

  if (!fieldNode) return null;

  const definition = index.nodesById.get(fieldNode.fieldId)?.fieldDefinition;

  if (!definition) return null;

  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const setValue = (value: FieldValue) =>
    fieldTransforms.setValue(fieldNode.parentNodeId, fieldNode.fieldId, value);
  const clearValue = () =>
    fieldTransforms.clearValue(fieldNode.parentNodeId, fieldNode.fieldId);

  if (definition.type === 'plain') {
    if (fieldNode.value) return null;

    return <UnsetValuePlaceholder />;
  }

  if (definition.type === 'number') {
    const value =
      fieldNode.value?.type === 'number' ? fieldNode.value.value : undefined;

    return (
      <ValueControl>
        <input
          aria-label="数字字段值"
          className="h-7 w-full min-w-0 rounded border-0 bg-transparent px-1.5 text-[13px] text-[#28312c] outline-none hover:bg-[#f5f7f5] focus:bg-white focus:ring-1 focus:ring-[#9eb7aa]"
          data-plate-prevent-deselect
          inputMode="decimal"
          placeholder="未设置"
          type="number"
          value={value ?? ''}
          onChange={(event) => {
            const raw = event.target.value;

            if (!raw) {
              clearValue();
              return;
            }

            const nextValue = Number(raw);

            if (Number.isFinite(nextValue)) {
              setValue({ type: 'number', value: nextValue });
            }
          }}
        />
      </ValueControl>
    );
  }

  if (definition.type === 'checkbox') {
    const value =
      fieldNode.value?.type === 'checkbox' ? fieldNode.value.value : undefined;

    return (
      <ValueControl>
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-1.5 text-[13px] text-[#59615c] hover:bg-[#f5f7f5]">
          <Checkbox
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
      </ValueControl>
    );
  }

  if (definition.type === 'date') {
    const value = fieldNode.value?.type === 'date' ? fieldNode.value.value : '';

    return (
      <ValueControl>
        <input
          aria-label="日期字段值"
          className="h-7 rounded border-0 bg-transparent px-1.5 text-[13px] text-[#39433d] outline-none hover:bg-[#f5f7f5] focus:bg-white focus:ring-1 focus:ring-[#9eb7aa]"
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
      </ValueControl>
    );
  }

  const currentValue =
    fieldNode.value?.type === definition.type ? fieldNode.value.value : undefined;
  const candidates = getFieldValueCandidates(index, fieldNode.fieldId);

  return (
    <ValueControl>
      <Select
        value={currentValue}
        onValueChange={(value) =>
          setValue({
            type: definition.type,
            value,
          } as Extract<FieldValue, { type: 'from-supertag' | 'options' }>)
        }
      >
        <SelectTrigger
          className="h-7 max-w-56 border-0 bg-transparent px-1.5 text-[13px] shadow-none hover:bg-[#f5f7f5] focus:ring-1"
          data-plate-prevent-deselect
        >
          <SelectValue placeholder="未设置" />
        </SelectTrigger>
        <SelectContent align="start">
          {candidates.length === 0 ? (
            <div className="px-2 py-2 text-muted-foreground text-xs">
              暂无可选节点
            </div>
          ) : (
            candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </ValueControl>
  );
}

function ValueControl({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="tana-valueControl absolute top-0 right-4 z-10 flex h-8 items-center"
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
      className="pointer-events-none absolute top-0 z-10 flex h-8 items-center text-[#9aa19d] text-[13px]"
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
export const NodeRendererRegistry: Record<
  TanaNodeSemanticType,
  TanaNodeRenderer
> = {
  content: { Workspace: OutlineRenderer },
  'field-definition': {
    Block: FieldDefinitionHint,
    Workspace: OutlineRenderer,
  },
  field: { Block: FieldRenderer, Workspace: OutlineRenderer },
  option: { Block: OptionHint, Workspace: OutlineRenderer },
  'supertag-definition': {
    Block: SupertagHint,
    Workspace: SupertagRenderer,
  },
  value: { Block: ValueRenderer, Workspace: OutlineRenderer },
  view: { Block: ViewHint, Workspace: ViewRenderer },
};

export function getNodeRenderer(semanticType: TanaNodeSemanticType): TanaNodeRenderer {
  return NodeRendererRegistry[semanticType];
}

function SupertagInstances({
  definition,
  index,
}: {
  definition: TanaNode;
  index: TanaIndex;
}) {
  const editor = useEditorRef();
  const instanceIds = index.nodesBySupertag.get(definition.id) ?? [];
  const templates = getSupertagTemplateFields(index, definition.id);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-[#e7ebe8] bg-[linear-gradient(180deg,#fbfdfb_0%,#fff_100%)] px-6 py-7 sm:px-[max(48px,calc(50%-390px))]">
        <p className="mb-2 flex items-center gap-1.5 text-[#47725f] text-xs">
          <HashIcon className="size-3.5" />
          超级标签定义
        </p>
        <h1 className="font-semibold text-2xl text-[#202421] tracking-normal">
          #{definition.text || '未命名超级标签'}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {templates.length === 0 ? (
            <span className="text-[#909892] text-xs">尚未配置模板字段</span>
          ) : (
            templates.map((template) => (
              <button
                key={template.template.id}
                className="rounded-full border border-[#dfe8e2] bg-white px-2.5 py-1 text-[#4e6358] text-[11px] hover:border-[#b8ccbf] hover:text-[#245b46]"
                type="button"
                onClick={() =>
                  editor.getTransforms(TanaZoomPlugin).zoom.to(template.field.id)
                }
              >
                {template.field.text || '未命名字段'}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-[max(48px,calc(50%-390px))]">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-medium text-[#4c5750] text-xs">实例</p>
          <span className="rounded-full bg-[#eff4f1] px-2 py-0.5 text-[#66736b] text-[10px] tabular-nums">
            {instanceIds.length}
          </span>
        </div>
        {instanceIds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dfe6e1] px-6 py-10 text-center">
            <HashIcon className="mx-auto mb-2 size-5 text-[#a0aaa3]" />
            <p className="text-muted-foreground text-sm">暂无实例</p>
            <p className="mt-1 text-[#9aa19d] text-xs">在任意节点输入 # 应用此超级标签。</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {instanceIds.map((instanceId) => {
              const instance = index.nodesById.get(instanceId);

              if (!instance) return null;

              const values = index.fieldValues.get(instance.id);

              return (
                <button
                  key={instance.id}
                  className="group rounded-xl border border-[#e4e9e6] bg-white p-3 text-left shadow-[0_1px_2px_rgb(31_54_43/0.03)] hover:border-[#c7d6cd] hover:bg-[#fbfdfc]"
                  type="button"
                  onClick={() =>
                    editor.getTransforms(TanaZoomPlugin).zoom.to(instance.id)
                  }
                >
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-[#2b332e] text-sm">
                      {instance.text || '未命名节点'}
                    </span>
                    <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0 text-[#9aa39d] group-hover:text-[#3e705a]" />
                  </span>
                  {templates.length > 0 && (
                    <span className="mt-2 block space-y-1">
                      {templates.slice(0, 3).map((template) => (
                        <span
                          key={template.field.id}
                          className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[11px]"
                        >
                          <span className="truncate text-[#849088]">
                            {template.field.text || '字段'}
                          </span>
                          <span className="truncate text-[#56615a]">
                            {formatFieldValue(
                              index,
                              values?.get(template.field.id)
                            )}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function formatFieldValue(index: TanaIndex, value?: FieldValue): string {
  if (!value) return '未设置';

  if (value.type === 'checkbox') return value.value ? '是' : '否';
  if (value.type === 'options' || value.type === 'from-supertag') {
    return index.nodesById.get(value.value)?.text || '未命名节点';
  }

  return String(value.value);
}
