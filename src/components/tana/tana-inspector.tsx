'use client';

import * as React from 'react';

import { ArrowUpRightIcon, Link2Icon, Settings2Icon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaPresentationPlugin } from '@/components/editor/plugins/tana-presentation-plugin';
import { TanaReferencePlugin } from '@/components/editor/plugins/tana-reference-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getNodeReferenceCandidatesFromIndex,
  getNodeFieldDescriptors,
  getSupertagTemplateFields,
  isTanaNodeActive,
  resolveTanaNodeTitle,
  type FieldDefinition,
  type FieldType,
  type NodeId,
  type TanaBlockElement,
  type TanaFieldDescriptor,
  type TanaIndex,
} from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import {
  TanaSearchDefinitionEditor,
  TanaViewConfigurationEditor,
} from './tana-view-editor';

const fieldTypeLabels: Record<FieldType, string> = {
  checkbox: '复选框',
  date: '日期',
  email: '邮箱',
  'from-supertag': '来自超级标签',
  number: '数字',
  options: '选项',
  plain: '文本',
  url: '网址',
};

const fieldTypes: readonly FieldType[] = [
  'plain',
  'number',
  'checkbox',
  'date',
  'email',
  'options',
  'from-supertag',
  'url',
];

/**
 * The Inspector owns semantic configuration, Field source navigation, and
 * body visibility. Node creation and Field Values stay in the Plate outline.
 */
export function TanaInspector({ activeNodeId, onClose }: {
  activeNodeId: NodeId | null;
  onClose: () => void;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const node = activeNodeId ? index.nodesById.get(activeNodeId) : undefined;

  if (!node) {
    return (
      <aside aria-label="检查器" className="relative h-full w-80 max-w-full shrink-0 border-l border-[var(--tana-divider)] bg-[var(--tana-sidebar)] p-5">
        <button className="absolute top-2 right-3 rounded px-2 py-1 text-xs focus-visible:ring-2" aria-label="关闭检查器" onClick={onClose}>关闭</button>
        <h2 className="font-medium text-sm">检查器</h2>
        <p className="mt-3 text-[var(--tana-text-tertiary)] text-xs">选择一个节点以查看详细信息。</p>
      </aside>
    );
  }

  const descriptors = getNodeFieldDescriptors(index, node.id);
  const systemFields = descriptors.filter(({ source }) => source === 'system');
  const customFields = descriptors.filter(({ source }) => source === 'custom');
  const isSupertagDefinition = node.semanticTypes.includes('supertag-definition');
  const isFieldDefinition = node.fieldDefinition !== undefined;
  const isSearch = node.searchDefinition !== undefined;
  const isView = node.viewDefinition !== undefined;
  const isOrdinaryNode = !isFieldDefinition && !isSupertagDefinition && !isSearch && !isView;
  const parentNode = index.parentNodeIds.get(node.id)
    ? index.nodesById.get(index.parentNodeIds.get(node.id)!)
    : undefined;
  const isSupertagTemplateField =
    parentNode?.semanticTypes.includes('supertag-definition') === true &&
    (node.fieldDefinition !== undefined || (node.node as TanaBlockElement).tanaFieldId !== undefined);
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
    <aside aria-label="检查器" className="relative h-full w-80 max-w-full shrink-0 overflow-y-auto border-l border-[var(--tana-divider)] bg-[var(--tana-sidebar)]">
      <div className="flex justify-end px-3 pt-2"><button className="rounded px-2 py-1 text-xs focus-visible:ring-2" aria-label="关闭检查器" onClick={onClose}>关闭</button></div>
      <div className="px-5 pt-5 pb-4">
        <p className="mb-2 text-[var(--tana-text-tertiary)] text-[10px] uppercase tracking-[0.12em]">
          配置
        </p>
        <h2 className="truncate font-medium text-[15px] text-[var(--tana-text)]">
          {resolveTanaNodeTitle(index, node.id) || '未命名节点'}
        </h2>
      </div>

      {isFieldDefinition && (
        <FieldDefinitionEditor
          definition={node.fieldDefinition!}
          fieldId={node.id}
        />
      )}

      {isSupertagTemplateField && (
        <TemplateFieldOptionalSection
          optional={(node.node as TanaBlockElement).tanaFieldOptional === true}
          templateNodeId={node.id}
        />
      )}

      {isOrdinaryNode && (
        <OrdinaryNodeProperties
          customFields={customFields}
          index={index}
          nodeId={node.id}
          supertagGroups={supertagGroups}
          systemFields={systemFields}
        />
      )}

      {isSupertagDefinition && (
        <SupertagFieldsSection fields={customFields} nodeId={node.id} />
      )}

      {isSupertagDefinition && (
        <SupertagInheritanceSection supertagId={node.id} />
      )}

      {isSupertagDefinition && <SupertagPresentationSection supertagId={node.id} />}

      {isOrdinaryNode && <ReferencesConfigurationSection nodeId={node.id} />}

      {isSearch && (
        <TanaSearchDefinitionEditor
          editor={editor}
          index={index}
          node={node.node as TanaBlockElement}
          nodeId={node.id}
        />
      )}

      {isView && <TanaViewConfigurationEditor index={index} nodeId={node.id} />}
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
    <section className="border-t border-[var(--tana-divider)] px-5 py-4">
      <h3 className="mb-2.5 font-medium text-[var(--tana-text-tertiary)] text-[10px] uppercase tracking-[0.1em]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Ordinary Nodes expose only their derived properties and reference actions. */
function OrdinaryNodeProperties({
  customFields,
  index,
  nodeId,
  supertagGroups,
  systemFields,
}: {
  customFields: readonly TanaFieldDescriptor[];
  index: TanaIndex;
  nodeId: NodeId;
  supertagGroups: ReadonlyMap<NodeId, readonly TanaFieldDescriptor[]>;
  systemFields: readonly TanaFieldDescriptor[];
}) {
  return (
    <FieldSection title="属性">
      <div className="space-y-0.5">
        {systemFields.map((field) => (
          <SystemFieldRow key={field.key} descriptor={field} />
        ))}
      </div>

      {supertagGroups.size > 0 && (
        <div className="mt-3 space-y-3 border-t border-[var(--tana-divider)] pt-3">
          {Array.from(supertagGroups.entries()).map(([supertagId, fields]) => (
            <div key={supertagId}>
              <p className="mb-1 text-[var(--tana-accent)] text-[11px]">
                #{index.nodesById.get(supertagId)?.text || '未命名超级标签'}
              </p>
              <div className="space-y-0.5">
                {fields.map((field) => (
                  <PresentationFieldRow
                    key={field.key}
                    descriptor={field}
                    nodeId={nodeId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {customFields.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-[var(--tana-divider)] pt-3">
          {customFields.map((field) => (
            <PresentationFieldRow key={field.key} descriptor={field} nodeId={nodeId} />
          ))}
        </div>
      )}

      <OptionalSupertagFieldRows nodeId={nodeId} />
    </FieldSection>
  );
}

/** A Supertag Definition exposes its real template Field Nodes, not instance data. */
function SupertagFieldsSection({
  fields,
  nodeId,
}: {
  fields: readonly TanaFieldDescriptor[];
  nodeId: NodeId;
}) {
  return (
    <FieldSection title="字段">
      {fields.length === 0 ? (
        <p className="text-[var(--tana-text-tertiary)] text-xs">暂无模板字段。</p>
      ) : (
        <div className="space-y-0.5">
          {fields.map((field) => (
            <PresentationFieldRow key={field.key} descriptor={field} nodeId={nodeId} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[var(--tana-text-tertiary)] text-[11px]">
        在正文空节点输入 &gt; 添加字段
      </p>
    </FieldSection>
  );
}

function TemplateFieldOptionalSection({
  optional,
  templateNodeId,
}: {
  optional: boolean;
  templateNodeId: NodeId;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();

  return (
    <FieldSection title="模板字段">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
        <Checkbox
          aria-label="设为可选字段"
          checked={optional}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              editor.getTransforms(TanaFieldPlugin).field.setOptional(templateNodeId, checked);
            }
          }}
        />
        应用标签时不自动添加
      </label>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
        <Checkbox
          aria-label="设为置顶字段"
          checked={
            index.nodesById.get(templateNodeId)?.node.tanaFieldPinned === true
          }
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') {
              editor.getTransforms(TanaFieldPlugin).field.setPinned(templateNodeId, checked);
            }
          }}
        />
        在实例中置顶显示
      </label>
    </FieldSection>
  );
}

/** The Definition stores only parent NodeIds; effective Fields stay derived. */
function SupertagInheritanceSection({ supertagId }: { supertagId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const definition = index.nodesById.get(supertagId)?.supertagDefinition;
  const parentIds = definition?.extends ?? [];
  const candidates = Array.from(index.nodesById.values()).filter(
    (node) =>
      node.id !== supertagId &&
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes('supertag-definition') &&
      !parentIds.includes(node.id)
  );
  const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;

  return (
    <FieldSection title="继承超级标签">
      {parentIds.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {parentIds.map((parentId) => (
            <div
              key={parentId}
              className="flex min-h-8 items-center gap-2 rounded px-1.5 text-xs hover:bg-[var(--tana-hover)]"
            >
              <span className="min-w-0 flex-1 truncate">
                #{index.nodesById.get(parentId)?.text || '已删除超级标签'}
              </span>
              <button
                className="text-[var(--tana-text-tertiary)] hover:text-destructive"
                type="button"
                onClick={() =>
                  supertag.setExtends(
                    supertagId,
                    parentIds.filter((id) => id !== parentId)
                  )
                }
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}
      {candidates.length > 0 && (
        <Select onValueChange={(parentId) => supertag.setExtends(supertagId, [...parentIds, parentId])}>
          <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
            <SelectValue placeholder="添加父标签" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                #{candidate.text || '未命名超级标签'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldSection>
  );
}

/** Configuration is stored only on the Definition Node; rendered titles stay derived. */
function SupertagPresentationSection({ supertagId }: { supertagId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const definition = index.nodesById.get(supertagId)?.supertagDefinition;
  const candidates = Array.from(index.nodesById.values()).filter(
    (node) =>
      node.id !== supertagId &&
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes('supertag-definition')
  );
  const supertag = editor.getTransforms(TanaSupertagPlugin).supertag;
  const emptyValue = '__no-default-child__';

  return (
    <FieldSection title="标签展示">
      <label className="mb-2 block text-xs text-[var(--tana-text-secondary)]" htmlFor={`title-expression-${supertagId}`}>
        标题表达式
      </label>
      <input
        className="mb-3 h-8 w-full rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-xs outline-none focus:border-[var(--tana-accent)]"
        defaultValue={definition?.titleExpression ?? ''}
        id={`title-expression-${supertagId}`}
        placeholder="例如：${状态} ${名称}"
        onBlur={(event) => supertag.setTitleExpression(supertagId, event.currentTarget.value)}
      />
      <p className="mb-3 text-[var(--tana-text-tertiary)] text-[11px]">
        支持 ${'{name}'}、${'{字段名}'} 和 ${'{字段名?|30…}'}；不会改写原始节点标题。
      </p>
      <label className="mb-2 block text-xs text-[var(--tana-text-secondary)]">默认子超级标签</label>
      <Select
        value={definition?.defaultChildSupertagId ?? emptyValue}
        onValueChange={(value) =>
          supertag.setDefaultChildSupertag(
            supertagId,
            value === emptyValue ? null : value
          )
        }
      >
        <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={emptyValue}>无</SelectItem>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              #{candidate.text || '未命名超级标签'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldSection>
  );
}

function SystemFieldRow({ descriptor }: { descriptor: TanaFieldDescriptor }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-1 text-xs">
      <span className="text-[var(--tana-text-tertiary)]">{descriptor.label}</span>
      <span className="truncate text-[var(--tana-text-secondary)]">{descriptor.systemValue}</span>
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
    <div className="group flex min-h-8 items-center gap-2 rounded px-1.5 text-xs hover:bg-[var(--tana-hover)]">
      <button
        className={
          descriptor.visible
            ? 'min-w-0 flex-1 truncate text-left hover:text-[var(--tana-link)]'
            : 'min-w-0 flex-1 truncate text-left text-[var(--tana-text-tertiary)] line-through hover:text-[var(--tana-text-secondary)]'
        }
        title="打开字段定义"
        type="button"
        onClick={() => descriptor.fieldId && zoom.to(descriptor.fieldId)}
      >
        {descriptor.label}
      </button>
      <button
        className="opacity-0 text-[var(--tana-text-tertiary)] text-[11px] transition-opacity hover:text-[var(--tana-text)] focus:opacity-100 group-hover:opacity-100"
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
      {descriptor.pinned && (
        <span className="shrink-0 text-[var(--tana-accent)] text-[10px]">置顶</span>
      )}
    </div>
  );
}

/** Optional template bindings remain definitions until the user materializes a real Field Node. */
function OptionalSupertagFieldRows({ nodeId }: { nodeId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const node = index.nodesById.get(nodeId);

  if (!node) return null;

  const existing = new Set(
    (index.fieldNodesByParent.get(nodeId) ?? []).map((fieldNode) => fieldNode.fieldId)
  );
  const seen = new Set<NodeId>();
  const templates = node.supertagIds.flatMap((supertagId) =>
    getSupertagTemplateFields(index, supertagId)
      .filter((template) => template.optional && !existing.has(template.fieldId))
      .flatMap((template) => {
        if (seen.has(template.fieldId)) return [];
        seen.add(template.fieldId);
        return [{ ...template, supertagId }];
      })
  );

  if (templates.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--tana-divider)] pt-3">
      <p className="mb-1 text-[var(--tana-text-tertiary)] text-[11px]">可选字段</p>
      <div className="space-y-0.5">
        {templates.map((template) => (
          <button
            key={`${template.supertagId}:${template.fieldId}`}
            className="flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left text-xs hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() =>
              editor.getTransforms(TanaFieldPlugin).field.materialize(nodeId, template.fieldId)
            }
          >
            <span className="min-w-0 flex-1 truncate">
              {template.field.text || '未命名字段'}
            </span>
            <span className="text-[var(--tana-accent)] text-[11px]">添加</span>
          </button>
        ))}
      </div>
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
  const [cardinalityNotice, setCardinalityNotice] = React.useState<string>();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const supertags = Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes('supertag-definition')
  );

  const changeType = (type: FieldType) => {
    const shared = {
      ...(definition.cardinality === 'list' ? { cardinality: 'list' as const } : {}),
      ...(definition.required === true ? { required: true as const } : {}),
    };
    const nextDefinition: FieldDefinition =
      type === 'from-supertag'
        ? { ...shared, sourceSupertagId: null, type }
        : { ...shared, type };

    fieldTransforms.updateDefinition(fieldId, nextDefinition);
  };

  const setCardinality = (cardinality: 'list' | 'single') => {
    const next = { ...definition } as FieldDefinition & { cardinality?: 'list' | 'single' };

    if (cardinality === 'list') {
      next.cardinality = 'list';
    } else {
      delete next.cardinality;
    }

    const updated = fieldTransforms.updateDefinition(fieldId, next);

    setCardinalityNotice(
      updated || cardinality !== 'single'
        ? undefined
        : '该字段仍有节点使用多个值，不能改为单个值。'
    );
  };

  const setRequired = (required: boolean) => {
    const definitionWithoutRequired = { ...definition };

    delete definitionWithoutRequired.required;

    fieldTransforms.updateDefinition(
      fieldId,
      required
        ? { ...definitionWithoutRequired, required: true }
        : definitionWithoutRequired
    );
  };

  const updateNumberBoundary = (boundary: 'max' | 'min', rawValue: string) => {
    if (definition.type !== 'number') return;

    const value = rawValue.trim() === '' ? undefined : Number(rawValue);

    if (value !== undefined && !Number.isFinite(value)) return;

    const next = { ...definition };

    if (boundary === 'max') {
      if (value === undefined) delete next.max;
      else next.max = value;
    } else if (value === undefined) {
      delete next.min;
    } else {
      next.min = value;
    }

    if (
      next.min !== undefined &&
      next.max !== undefined &&
      next.min > next.max
    ) {
      return;
    }

    fieldTransforms.updateDefinition(fieldId, next);
  };

  return (
    <FieldSection title="字段设置">
      <div className="mb-3 flex items-center gap-2 text-[var(--tana-text-secondary)] text-xs">
        <Settings2Icon className="size-3.5 text-[var(--tana-text-tertiary)]" />
        <span>字段类型</span>
      </div>
      <Select value={definition.type} onValueChange={(value) => changeType(value as FieldType)}>
        <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
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

      <div className="mt-3">
        <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">字段值数量</p>
        <Select
          value={definition.cardinality ?? 'single'}
          onValueChange={(value) => setCardinality(value as 'list' | 'single')}
        >
          <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">单个值</SelectItem>
            <SelectItem value="list">多个值</SelectItem>
          </SelectContent>
        </Select>
        {cardinalityNotice && (
          <p className="mt-1.5 text-amber-700 text-xs" role="status">
            {cardinalityNotice}
          </p>
        )}
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
        <Checkbox
          aria-label="设为必填字段"
          checked={definition.required === true}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') setRequired(checked);
          }}
        />
        必填（未设置时显示提示）
      </label>

      {definition.type === 'from-supertag' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">候选来源</p>
          <Select
            value={definition.sourceSupertagId ?? undefined}
            onValueChange={(sourceSupertagId) =>
              fieldTransforms.updateDefinition(fieldId, {
                ...(definition.cardinality === 'list' ? { cardinality: 'list' as const } : {}),
                ...(definition.required === true ? { required: true as const } : {}),
                sourceSupertagId,
                type: 'from-supertag',
              })
            }
          >
            <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
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
        <p className="mt-3 text-[var(--tana-text-tertiary)] text-[11px]">
          选项由正文中的直接子节点定义，可使用 Enter、拖拽与删除编辑。
        </p>
      )}

      {definition.type === 'number' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[var(--tana-text-tertiary)] text-[11px]">
            最小值
            <input
              className="mt-1 h-8 w-full rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-[var(--tana-text-secondary)] text-xs outline-none focus:border-[var(--tana-accent)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]"
              defaultValue={definition.min ?? ''}
              inputMode="decimal"
              type="number"
              onBlur={(event) => updateNumberBoundary('min', event.currentTarget.value)}
            />
          </label>
          <label className="text-[var(--tana-text-tertiary)] text-[11px]">
            最大值
            <input
              className="mt-1 h-8 w-full rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-[var(--tana-text-secondary)] text-xs outline-none focus:border-[var(--tana-accent)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]"
              defaultValue={definition.max ?? ''}
              inputMode="decimal"
              type="number"
              onBlur={(event) => updateNumberBoundary('max', event.currentTarget.value)}
            />
          </label>
        </div>
      )}
    </FieldSection>
  );
}

/** Ordinary Node reference controls keep every relation derived from TanaIndex. */
function ReferencesConfigurationSection({ nodeId }: { nodeId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const node = index.nodesById.get(nodeId);
  const references = index.backlinks.get(nodeId) ?? [];
  const canCreateReference = !!node && !node.systemNode && !node.referenceTargetId;
  const candidates = canCreateReference
    ? getNodeReferenceCandidatesFromIndex(index).filter((candidate) => candidate.id !== nodeId)
    : [];

  return (
    <FieldSection title="引用">
      {canCreateReference && (
        <Select
          onValueChange={(targetNodeId) =>
            editor.getTransforms(TanaReferencePlugin).reference.setTarget(nodeId, targetNodeId)
          }
        >
          <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
            <SelectValue placeholder="引用另一个节点" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.text || '未命名节点'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className={canCreateReference ? 'mt-3 border-t border-[var(--tana-divider)] pt-3' : undefined}>
        <p className="mb-1 text-[var(--tana-text-tertiary)] text-[11px]">
          被引用 {references.length}
        </p>
        {references.length === 0 ? (
          <p className="text-[var(--tana-text-tertiary)] text-xs">暂无引用。</p>
        ) : (
          <div className="space-y-0.5">
            {references.map((reference, position) => {
              const source = index.nodesById.get(reference.sourceNodeId);

              return (
                <button
                  key={`${reference.kind}-${reference.sourceNodeId}-${reference.path.join('.')}-${position}`}
                  className="group flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left text-xs hover:bg-[var(--tana-hover)]"
                  type="button"
                  onClick={() =>
                    editor.getTransforms(TanaZoomPlugin).zoom.to(reference.sourceNodeId)
                  }
                >
                  <Link2Icon className="size-3 shrink-0 text-[var(--tana-reference)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {source?.text || '未命名节点'}
                  </span>
                  <ArrowUpRightIcon className="size-3 shrink-0 text-[var(--tana-text-tertiary)] opacity-0 group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </FieldSection>
  );
}
