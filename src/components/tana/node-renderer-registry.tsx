'use client';

import {
  EyeOffIcon,
  HashIcon,
  ListFilterIcon,
  PinIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
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
  SelectValue
} from '@/components/ui/select';
import type {
  FieldValue,
  NodeId,
  TanaBlockElement,
  TanaIndex,
  TanaNode,
  TanaNodeSemanticType,
} from '@/lib/tana';
import {
  getFieldValueCandidates,
  getSupertagTemplateFields,
} from '@/lib/tana';

import { OutlineNodeView } from './outline-node-view';
import { NodeProjection } from './node-projection';
import { TanaView } from './tana-view';
import { TanaSupertagPage } from './tana-supertag-page';

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

/**
 * A block Reference is a read-through projection: its own Plate Node carries
 * only a target NodeId, while title and tags are always derived from — and
 * edits always write to — the canonical target Node.
 */
function ReferenceRenderer({ element, index }: TanaNodeBlockRendererProps) {
  const targetNodeId = (element as TanaBlockElement).tanaReferenceTargetId;
  const indent = typeof element.indent === 'number' ? element.indent : 0;

  return (
    <div
      className="absolute inset-y-0 z-20"
      contentEditable={false}
      style={{ left: `${indent * 24}px`, right: 0 }}
    >
      <NodeProjection
        index={index}
        targetNodeId={targetNodeId}
        variant="block-reference"
      />
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

  if (!fieldNode || typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);
  const indent = typeof element.indent === 'number' ? element.indent : 0;
  const labelLeft = `${indent * 24}px`;
  const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const pinned = (index.nodesById.get(fieldNode.parentNodeId)?.supertagIds ?? []).some(
    (supertagId) =>
      getSupertagTemplateFields(index, supertagId).some(
        (template) => template.fieldId === fieldId && template.pinned
      )
  );
  const canAddValue = field?.fieldDefinition?.cardinality === 'list';

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
        <span className="flex min-w-0 items-center gap-1.5">
          {pinned && <PinIcon aria-label="已置顶" className="size-3 shrink-0" />}
          <span className="truncate">{field?.text || '未命名字段'}</span>
          {field?.fieldDefinition?.required && (
            <span aria-label="必填字段" className="shrink-0 text-[#ad5c42]">*</span>
          )}
        </span>
      </button>

      <div className="tana-fieldActions pointer-events-auto ml-auto flex items-center gap-0.5 rounded-md bg-white/95 p-0.5 opacity-0 shadow-[0_1px_4px_rgb(31_54_43/0.08)] transition-opacity">
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
    (candidate) => candidate.valueNodeIds.includes(nodeId)
  );

  if (!fieldNode) return null;

  const definition = index.nodesById.get(fieldNode.fieldId)?.fieldDefinition;

  if (!definition) return null;

  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const currentFieldValue = fieldNode.valueByNodeId.get(nodeId);
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
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-1.5 text-[13px] text-[#59615c] hover:bg-[#f5f7f5]">
          <Checkbox
            aria-label={`${index.nodesById.get(fieldNode.fieldId)?.text || '字段'}字段值`}
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
      </ValueControl>
    );
  }

  if (definition.type === 'date') {
    const value = currentFieldValue?.type === 'date' ? currentFieldValue.value : '';

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
      {(currentValue || definition.cardinality === 'list') && (
        <ValueClearButton onClear={clearValue} />
      )}
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
  reference: { Block: ReferenceRenderer, Workspace: OutlineRenderer },
  search: { Workspace: ViewRenderer },
  'supertag-definition': {
    Block: SupertagHint,
    Workspace: SupertagInstancesRenderer
  },
  value: { Block: ValueRenderer, Workspace: OutlineRenderer },
  view: { Block: ViewHint, Workspace: ViewRenderer }
};

export function getNodeRenderer(semanticType: TanaNodeSemanticType): TanaNodeRenderer {
  return NodeRendererRegistry[semanticType];
}
