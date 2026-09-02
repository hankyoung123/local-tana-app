'use client';

import * as React from 'react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getNodeFieldDescriptors,
  type FieldDefinition,
  type FieldType,
  type NodeId,
  type TanaFieldDescriptor,
} from '@/lib/tana';
import { useEditorRef } from 'platejs/react';

import { useTanaIndex } from './tana-index-context';

const fieldTypeLabels: Record<FieldType, string> = {
  checkbox: '复选框',
  date: '日期',
  'from-supertag': '来自超级标签',
  number: '数字',
  options: '选项',
  plain: '文本',
};

const fieldTypes: readonly FieldType[] = [
  'plain',
  'number',
  'checkbox',
  'date',
  'options',
  'from-supertag',
];

/**
 * The Fields Panel owns only field source, body visibility, and direct field
 * creation. Field Values remain editable where the Node content is rendered.
 */
export function TanaInspector({ activeNodeId }: { activeNodeId: NodeId | null }) {
  const index = useTanaIndex();
  const node = activeNodeId ? index.nodesById.get(activeNodeId) : undefined;

  if (!node) {
    return (
      <aside className="h-full w-72 shrink-0 border-l border-[#e6ebe8] bg-[#fbfcfb] p-5">
        <h2 className="font-medium text-sm">字段</h2>
        <p className="mt-3 text-[#7b827d] text-xs">选择一个节点以查看字段。</p>
      </aside>
    );
  }

  const descriptors = getNodeFieldDescriptors(index, node.id);
  const systemFields = descriptors.filter(({ source }) => source === 'system');
  const customFields = descriptors.filter(({ source }) => source === 'custom');
  const supertagGroups = new Map<NodeId, TanaFieldDescriptor[]>();

  descriptors
    .filter(({ source }) => source === 'supertag')
    .forEach((descriptor) => {
      const supertagId = descriptor.supertagIds?.[0];

      if (!supertagId) return;

      supertagGroups.set(supertagId, [
        ...(supertagGroups.get(supertagId) ?? []),
        descriptor,
      ]);
    });

  return (
    <aside className="h-full w-72 shrink-0 overflow-y-auto border-l border-[#e6ebe8] bg-[#fbfcfb]">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-4">
        <h2 className="font-medium text-sm">字段</h2>
        <span className="text-[#8b938d] text-[11px]">{node.text || '未命名节点'}</span>
      </div>

      <FieldSection title="系统字段">
        {systemFields.map((field) => (
          <SystemFieldRow key={field.key} descriptor={field} />
        ))}
      </FieldSection>

      <FieldSection title="标签字段">
        {supertagGroups.size === 0 ? (
          <p className="text-[#7b827d] text-xs">当前节点没有标签字段。</p>
        ) : (
          Array.from(supertagGroups.entries()).map(([supertagId, fields]) => (
            <div key={supertagId} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[#3b6d58] text-xs">
                #{index.nodesById.get(supertagId)?.text || '未命名超级标签'}
              </p>
              <div className="space-y-0.5">
                {fields.map((field) => (
                  <PresentationFieldRow
                    key={field.key}
                    descriptor={field}
                    nodeId={node.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </FieldSection>

      <FieldSection title="自定义字段">
        {customFields.length === 0 ? (
          <p className="mb-2 text-[#7b827d] text-xs">暂无自定义字段。</p>
        ) : (
          <div className="mb-3 space-y-0.5">
            {customFields.map((field) => (
              <PresentationFieldRow
                key={field.key}
                descriptor={field}
                nodeId={node.id}
              />
            ))}
          </div>
        )}
        <AddCustomField nodeId={node.id} />
      </FieldSection>
    </aside>
  );
}

function FieldSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="border-t border-[#edf0ee] px-5 py-4">
      <h3 className="mb-2.5 font-medium text-[#7b827d] text-[10px] uppercase tracking-[0.1em]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SystemFieldRow({ descriptor }: { descriptor: TanaFieldDescriptor }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1 text-xs">
      <span className="text-[#7b827d]">{descriptor.label}</span>
      <span className="truncate text-[#4c534e]">{descriptor.systemValue}</span>
    </div>
  );
}

function PresentationFieldRow({
  descriptor,
  nodeId,
}: {
  descriptor: TanaFieldDescriptor;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;

  return (
    <div className="group flex min-h-7 items-center gap-2 rounded px-1.5 text-xs hover:bg-[#f1f5f2]">
      <span
        className={
          descriptor.visible
            ? 'min-w-0 flex-1 truncate'
            : 'min-w-0 flex-1 truncate text-[#9aa19d] line-through'
        }
      >
        {descriptor.label}
      </span>
      <button
        className="opacity-0 text-[#7b827d] text-[11px] transition-opacity hover:text-[#202421] focus:opacity-100 group-hover:opacity-100"
        type="button"
        onClick={() => {
          if (!descriptor.fieldNodeId) return;

          presentation.setFieldVisible(
            nodeId,
            descriptor.fieldNodeId,
            !descriptor.visible
          );
        }}
      >
        {descriptor.visible ? '隐藏' : '显示'}
      </button>
    </div>
  );
}

function AddCustomField({ nodeId }: { nodeId: NodeId }) {
  const editor = useEditorRef();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const [isAdding, setIsAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<FieldType>('plain');

  const createDefinition = (): FieldDefinition => {
    if (type === 'options') return { type };
    if (type === 'from-supertag') return { sourceSupertagId: null, type };

    return { type };
  };

  const addField = () => {
    const fieldId = fieldTransforms.createDefinition(name, createDefinition());

    if (!fieldId || !fieldTransforms.materialize(nodeId, fieldId)) return;

    setName('');
    setType('plain');
    setIsAdding(false);
  };

  if (!isAdding) {
    return (
      <button
        className="text-[#527664] text-xs hover:text-[#1f6f52]"
        type="button"
        onClick={() => setIsAdding(true)}
      >
        + 添加自定义字段
      </button>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <Input
        autoFocus
        className="h-8 bg-white text-xs shadow-none"
        placeholder="字段名称"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Select value={type} onValueChange={(value) => setType(value as FieldType)}>
        <SelectTrigger className="h-8 bg-white text-xs shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fieldTypes.map((fieldType) => (
            <SelectItem key={fieldType} value={fieldType}>
              {fieldTypeLabels[fieldType]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Button
          className="h-7 px-2 text-xs"
          disabled={!name.trim()}
          size="sm"
          type="button"
          onClick={addField}
        >
          添加
        </Button>
        <button
          className="text-[#7b827d] text-xs hover:text-[#202421]"
          type="button"
          onClick={() => setIsAdding(false)}
        >
          取消
        </button>
      </div>
    </div>
  );
}
