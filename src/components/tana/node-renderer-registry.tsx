'use client';

import { EyeOffIcon, HashIcon, ListFilterIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
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
  SelectValue
} from '@/components/ui/select';
import type { FieldValue, NodeId, TanaIndex, TanaNode, TanaNodeSemanticType } from '@/lib/tana';
import { getFieldValueCandidates } from '@/lib/tana';

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

function NodeSemanticHint({ icon, label }: { icon?: React.ReactNode; label: string }) {
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
  const definition = (
    element as TElement & {
      tanaFieldDefinition?: { type?: string };
    }
  ).tanaFieldDefinition;

  return (
    <NodeSemanticHint
      icon={<SlidersHorizontalIcon />}
      label={definition?.type ? `字段 · ${definition.type}` : '字段定义'}
    />
  );
}

function SupertagHint() {
  return <NodeSemanticHint icon={<HashIcon />} label="超级标签" />;
}

function ViewHint() {
  return <NodeSemanticHint icon={<ListFilterIcon />} label="视图" />;
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

/** Field occurrence labels are derived from their Field Definition Node. */
function FieldRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const editor = useEditorRef();
  const fieldNodeId = typeof element.id === 'string' ? element.id : undefined;
  const fieldNode = fieldNodeId ? index.fieldNodesById.get(fieldNodeId) : undefined;
  const fieldId = fieldNode?.fieldId;

  if (!fieldNode || typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);
  const indent = typeof element.indent === 'number' ? element.indent : 0;
  const labelLeft = `${indent * 24}px`;
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
 * editor while plain and number text continue to use Plate contenteditable.
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
  const clearValue = () => fieldTransforms.clearValue(fieldNode.parentNodeId, fieldNode.fieldId);

  if (definition.type === 'plain' || definition.type === 'number') {
    const text = fieldNode.valueNodeId
      ? index.nodesById.get(fieldNode.valueNodeId)?.text
      : undefined;

    return text ? null : <UnsetValuePlaceholder />;
  }

  if (definition.type === 'checkbox') {
    const value = fieldNode.value?.type === 'checkbox' ? fieldNode.value.value : undefined;

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
        {value !== undefined && <ValueClearButton onClear={clearValue} />}
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
            value
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
      {currentValue && <ValueClearButton onClear={clearValue} />}
    </ValueControl>
  );
}

function ValueClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      aria-label="清空字段值"
      className="grid size-6 shrink-0 place-items-center rounded text-[#929a95] hover:bg-[#edf3ef] hover:text-[#275d48]"
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
export const NodeRendererRegistry: Record<TanaNodeSemanticType, TanaNodeRenderer> = {
  content: { Workspace: OutlineRenderer },
  'field-definition': {
    Block: FieldDefinitionHint,
    Workspace: OutlineRenderer
  },
  field: { Block: FieldRenderer, Workspace: OutlineRenderer },
  option: { Workspace: OutlineRenderer },
  'supertag-definition': {
    Block: SupertagHint,
    Workspace: OutlineRenderer
  },
  value: { Block: ValueRenderer, Workspace: OutlineRenderer },
  view: { Block: ViewHint, Workspace: ViewRenderer }
};

export function getNodeRenderer(semanticType: TanaNodeSemanticType): TanaNodeRenderer {
  return NodeRendererRegistry[semanticType];
}
