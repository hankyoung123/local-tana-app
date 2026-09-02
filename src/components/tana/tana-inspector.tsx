'use client';

import * as React from 'react';

import { HashIcon, PlusIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

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
  getFieldValueCandidates,
  type FieldDefinition,
  type FieldType,
  type NodeId,
  type TanaBlockElement,
  type TanaFieldDescriptor,
  type TanaNodeSemanticType,
} from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import { TanaViewDefinitionEditor } from './tana-view-editor';

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

const semanticLabels: Record<TanaNodeSemanticType, string> = {
  content: '内容节点',
  'field-definition': '字段定义',
  field: '字段',
  option: '选项',
  'supertag-definition': '超级标签',
  value: '字段值',
  view: '视图',
};

/**
 * The Fields Panel owns only field source, body visibility, and direct field
 * creation. Field Values remain editable where the Node content is rendered.
 */
export function TanaInspector({ activeNodeId }: { activeNodeId: NodeId | null }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const node = activeNodeId ? index.nodesById.get(activeNodeId) : undefined;

  if (!node) {
    return (
      <aside className="h-full w-80 shrink-0 border-l border-[#e6ebe8] bg-[#fbfcfb] p-5">
        <h2 className="font-medium text-sm">检查器</h2>
        <p className="mt-3 text-[#7b827d] text-xs">选择一个节点以查看详细信息。</p>
      </aside>
    );
  }

  const descriptors = getNodeFieldDescriptors(index, node.id);
  const systemFields = descriptors.filter(({ source }) => source === 'system');
  const customFields = descriptors.filter(({ source }) => source === 'custom');
  const isSupertagDefinition = node.semanticTypes.includes('supertag-definition');
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
    <aside className="h-full w-80 shrink-0 overflow-y-auto border-l border-[#e6ebe8] bg-[#fbfcfb]">
      <div className="px-5 pt-5 pb-4">
        <p className="mb-2 text-[#8b938d] text-[10px] uppercase tracking-[0.12em]">
          当前节点
        </p>
        <h2 className="truncate font-medium text-[15px] text-[#242a26]">
          {node.text || '未命名节点'}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {node.semanticTypes.map((semantic) => (
            <span
              key={semantic}
              className="rounded-full bg-[#eaf1ed] px-2 py-0.5 text-[#3f6856] text-[10px]"
            >
              {semanticLabels[semantic]}
            </span>
          ))}
        </div>
        <p className="mt-2 truncate font-mono text-[#a0a6a2] text-[9px]" title={node.id}>
          {node.id}
        </p>
      </div>

      {node.fieldDefinition && (
        <FieldDefinitionEditor
          definition={node.fieldDefinition}
          fieldId={node.id}
        />
      )}

      <FieldSection title="属性">
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

      <FieldSection title={isSupertagDefinition ? '模板字段' : '自定义字段'}>
        {customFields.length === 0 ? (
          <p className="mb-2 text-[#7b827d] text-xs">
            {isSupertagDefinition ? '暂无模板字段。' : '暂无自定义字段。'}
          </p>
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
        <AddCustomField
          buttonLabel={isSupertagDefinition ? '添加模板字段' : '添加自定义字段'}
          nodeId={node.id}
        />
      </FieldSection>

      <TanaViewDefinitionEditor
        editor={editor}
        index={index}
        node={node.node as TanaBlockElement}
        nodeId={node.id}
      />
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
    <div className="group flex min-h-8 items-center gap-2 rounded px-1.5 text-xs hover:bg-[#f1f5f2]">
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

function FieldDefinitionEditor({
  definition,
  fieldId,
}: {
  definition: FieldDefinition;
  fieldId: NodeId;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const [optionName, setOptionName] = React.useState('');
  const candidates = getFieldValueCandidates(index, fieldId);
  const supertags = Array.from(index.nodesById.values()).filter((node) =>
    node.semanticTypes.includes('supertag-definition')
  );

  const changeType = (type: FieldType) => {
    const nextDefinition: FieldDefinition =
      type === 'from-supertag' ? { sourceSupertagId: null, type } : { type };

    fieldTransforms.updateDefinition(fieldId, nextDefinition);
  };

  return (
    <FieldSection title="字段设置">
      <div className="mb-3 flex items-center gap-2 text-[#4b544e] text-xs">
        <Settings2Icon className="size-3.5 text-[#718078]" />
        <span>字段类型</span>
      </div>
      <Select value={definition.type} onValueChange={(value) => changeType(value as FieldType)}>
        <SelectTrigger className="h-8 w-full bg-white text-xs shadow-none">
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

      {definition.type === 'from-supertag' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[#7b827d] text-[11px]">候选来源</p>
          <Select
            value={definition.sourceSupertagId ?? undefined}
            onValueChange={(sourceSupertagId) =>
              fieldTransforms.updateDefinition(fieldId, {
                sourceSupertagId,
                type: 'from-supertag',
              })
            }
          >
            <SelectTrigger className="h-8 w-full bg-white text-xs shadow-none">
              <SelectValue placeholder="选择超级标签" />
            </SelectTrigger>
            <SelectContent>
              {supertags.map((supertag) => (
                <SelectItem key={supertag.id} value={supertag.id}>
                  #{supertag.text || '未命名超级标签'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {definition.type === 'options' && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[#59645e] text-[11px]">
            <HashIcon className="size-3" />
            选项节点
          </div>
          <div className="mb-2 space-y-1">
            {candidates.length === 0 ? (
              <p className="text-[#8b938d] text-xs">暂无选项。</p>
            ) : (
              candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="group/option flex h-7 items-center rounded bg-white px-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.text || '未命名选项'}
                  </span>
                  <button
                    aria-label={`删除选项 ${candidate.text || ''}`}
                    className="opacity-0 text-[#939a95] hover:text-destructive group-hover/option:opacity-100"
                    title="删除选项节点"
                    type="button"
                    onClick={() => fieldTransforms.removeOption(fieldId, candidate.id)}
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-1.5">
            <Input
              className="h-8 bg-white text-xs shadow-none"
              placeholder="新选项"
              value={optionName}
              onChange={(event) => setOptionName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !optionName.trim()) return;
                event.preventDefault();
                fieldTransforms.createOption(fieldId, optionName);
                setOptionName('');
              }}
            />
            <Button
              aria-label="添加选项"
              className="size-8 shrink-0 p-0"
              disabled={!optionName.trim()}
              size="sm"
              variant="outline"
              onClick={() => {
                fieldTransforms.createOption(fieldId, optionName);
                setOptionName('');
              }}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </FieldSection>
  );
}

function AddCustomField({
  buttonLabel,
  nodeId,
}: {
  buttonLabel: string;
  nodeId: NodeId;
}) {
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
        + {buttonLabel}
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
