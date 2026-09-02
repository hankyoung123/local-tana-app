'use client';

import * as React from 'react';

import { ArrowUpRightIcon, Settings2Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
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

const semanticLabels: Partial<Record<TanaNodeSemanticType, string>> = {
  'field-definition': '字段定义',
  'supertag-definition': '超级标签',
  view: '视图',
};

/**
 * The Inspector owns semantic configuration, Field source navigation, and
 * body visibility. Node creation and Field Values stay in the Plate outline.
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
  const semanticBadges = node.semanticTypes.flatMap((semantic) => {
    const label = semanticLabels[semantic];

    return label ? [{ label, semantic }] : [];
  });
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
        {semanticBadges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {semanticBadges.map(({ label, semantic }) => (
            <span
              key={semantic}
              className="rounded-full bg-[#eaf1ed] px-2 py-0.5 text-[#3f6856] text-[10px]"
            >
              {semantic === 'supertag-definition' ? `# ${label}` : label}
            </span>
            ))}
          </div>
        )}
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
        <p className="mt-2 text-[#8b938d] text-[11px]">
          在正文空节点输入 &gt; 添加字段
        </p>
      </FieldSection>

      {isSupertagDefinition && (
        <SupertagInstancesSection supertagId={node.id} />
      )}

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
  const zoom = editor.getTransforms(TanaZoomPlugin).zoom;

  return (
    <div className="group flex min-h-8 items-center gap-2 rounded px-1.5 text-xs hover:bg-[#f1f5f2]">
      <button
        className={
          descriptor.visible
            ? 'min-w-0 flex-1 truncate text-left hover:text-[#1f6f52]'
            : 'min-w-0 flex-1 truncate text-left text-[#9aa19d] line-through hover:text-[#68716b]'
        }
        title="打开字段定义"
        type="button"
        onClick={() => descriptor.fieldId && zoom.to(descriptor.fieldId)}
      >
        {descriptor.label}
      </button>
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
        <p className="mt-3 text-[#8b938d] text-[11px]">
          选项由正文中的直接子节点定义，可使用 Enter、拖拽与删除编辑。
        </p>
      )}
    </FieldSection>
  );
}

function SupertagInstancesSection({ supertagId }: { supertagId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const instanceIds = index.nodesBySupertag.get(supertagId) ?? [];

  return (
    <FieldSection title={`实例 · ${instanceIds.length}`}>
      {instanceIds.length === 0 ? (
        <p className="text-[#7b827d] text-xs">暂无实例。</p>
      ) : (
        <div className="space-y-0.5">
          {instanceIds.map((instanceId) => {
            const instance = index.nodesById.get(instanceId);

            if (!instance) return null;

            return (
              <button
                key={instance.id}
                className="group flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left text-xs hover:bg-[#f1f5f2]"
                type="button"
                onClick={() =>
                  editor.getTransforms(TanaZoomPlugin).zoom.to(instance.id)
                }
              >
                <span className="min-w-0 flex-1 truncate">
                  {instance.text || '未命名节点'}
                </span>
                <ArrowUpRightIcon className="size-3 shrink-0 text-[#9aa19d] opacity-0 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
    </FieldSection>
  );
}
