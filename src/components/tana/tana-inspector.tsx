'use client';

import * as React from 'react';

import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Link2Icon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { useEditorRef } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
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
  getFieldDefinitionCandidatesFromIndex,
  getFieldValueCandidates,
  getActiveSupertagInstances,
  countTanaFieldOptionUsages,
  getSupertagTemplateFields,
  getTanaTitleExpressionDiagnostics,
  isTanaNodeActive,
  resolveTanaTitleExpression,
  resolveTanaNodeTitle,
  type FieldDefinition,
  type FieldType,
  type FieldVisibilityPolicy,
  type FieldValue,
  type NodeId,
  type TanaBlockElement,
  type TanaDoneState,
  type TanaSupertagCheckboxFieldMapping,
  type TanaFieldDescriptor,
  type TanaIndex,
  type TanaNode,
  type SupertagDefinition,
} from '@/lib/tana';

import { useTanaIndex } from './tana-index-context';
import {
  TanaSearchDefinitionEditor,
  TanaViewConfigurationEditor,
} from './tana-view-editor';
import { TanaShellControl } from './tana-shell-control';
import { TanaFieldValueEditor } from './node-renderer-registry';

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

const fieldVisibilityPolicyLabels: Record<FieldVisibilityPolicy, string> = {
  always: '始终显示',
  never: '从不隐藏',
  'when-empty': '值为空时隐藏',
  'when-non-empty': '有值时隐藏',
  'when-default': '值为默认值时隐藏',
};

/**
 * The Inspector owns semantic configuration, Field source navigation, and
 * body visibility. Node creation and Field Values stay in the Plate outline.
 */
export function TanaInspector({ activeNodeId, initialTab, onClose }: {
  activeNodeId: NodeId | null;
  initialTab?: string;
  onClose: () => void;
}) {
  const index = useTanaIndex();
  const node = activeNodeId ? index.nodesById.get(activeNodeId) : undefined;

  if (!node) {
    return (
      <aside aria-label="检查器" className="tana-inspector relative p-5">
        <button
          aria-label="关闭检查器"
          className="absolute top-2.5 right-3 grid size-7 place-items-center rounded-md text-[var(--tana-text-tertiary)] transition-colors hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)] focus-visible:ring-2"
          type="button"
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </button>
        <h2 className="font-medium text-sm">检查器</h2>
        <p className="mt-3 text-[var(--tana-text-tertiary)] text-xs">选择一个节点以查看详细信息。</p>
      </aside>
    );
  }

  return <TanaInspectorPanel key={`${node.id}:${initialTab ?? "default"}`} index={index} node={node} initialTab={initialTab} onClose={onClose} />;
}

function TanaInspectorPanel({
  index,
  node,
  initialTab,
  onClose,
}: {
  index: TanaIndex;
  node: TanaNode;
  initialTab?: string;
  onClose: () => void;
}) {
  const editor = useEditorRef();

  const descriptors = getNodeFieldDescriptors(index, node.id);
  const systemFields = descriptors.filter(({ source }) => source === 'system');
  const customFields = descriptors.filter(({ source }) => source === 'custom');
  const isSupertagDefinition = node.semanticTypes.includes('supertag-definition');
  const isFieldDefinition = node.fieldDefinition !== undefined;
  const isSearch = node.searchDefinition !== undefined;
  const isView = node.viewDefinition !== undefined;
  const isOrdinaryNode = !isFieldDefinition && !isSupertagDefinition && !isSearch && !isView;
  const inspectorTabs = isSupertagDefinition
    ? [
        { value: 'overview', label: '设置' },
        { value: 'fields', label: '字段' },
        { value: 'relations', label: '继承' },
      ]
    : [
        { value: 'properties', label: '属性' },
        { value: 'fields', label: '字段' },
        { value: 'references', label: '引用' },
      ];
  const defaultInspectorTab = initialTab ?? ((isSupertagDefinition || isOrdinaryNode) ? 'fields' : 'properties');
  const [activeInspectorTab, setActiveInspectorTab] = React.useState(defaultInspectorTab);
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
    <aside aria-label={isSupertagDefinition ? '超级标签配置' : '检查器'} className="tana-inspector">
      <div className="tana-inspector-header">
        <div className="tana-inspector-heading">
          <span>{isSupertagDefinition ? '配置超级标签' : '节点属性'}</span>
          <TanaShellControl label="关闭检查器" onClick={onClose}><XIcon className="size-3.5" /></TanaShellControl>
        </div>
        <div className="tana-inspector-identity">
          <h2>{resolveTanaNodeTitle(index, node.id) || '未命名节点'}</h2>
          <p className="mt-1 text-xs text-[var(--still-muted)]">{isSupertagDefinition ? '超级标签' : isFieldDefinition ? '字段定义' : '属性修改即时保存'}</p>
        </div>
        <TabsPrimitive.Root
          className="tana-inspector-tabs"
          value={activeInspectorTab}
          onValueChange={setActiveInspectorTab}
        >
          <TabsPrimitive.List aria-label="检查器分区" className="flex items-center gap-1">
            {inspectorTabs.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.value}
                className="tana-inspector-tab"
                value={tab.value}
              >
                {tab.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </TabsPrimitive.Root>
      </div>

      {activeInspectorTab === 'properties' && isFieldDefinition && (
        <FieldDefinitionEditor
          definition={node.fieldDefinition!}
          fieldId={node.id}
        />
      )}

      {activeInspectorTab === 'fields' && isSupertagTemplateField && (
        <TemplateFieldOptionalSection
          optional={(node.node as TanaBlockElement).tanaFieldOptional === true}
          templateNodeId={node.id}
        />
      )}

      {activeInspectorTab === 'properties' && isOrdinaryNode && (
        <OrdinaryNodeProperties
          systemFields={systemFields}
        />
      )}

      {activeInspectorTab === 'fields' && isOrdinaryNode && (
        <OrdinaryNodeFields
          customFields={customFields}
          index={index}
          nodeId={node.id}
          supertagGroups={supertagGroups}
        />
      )}

      {activeInspectorTab === 'fields' && isSupertagDefinition && (
        <SupertagFieldsSection nodeId={node.id} />
      )}

      {activeInspectorTab === 'relations' && isSupertagDefinition && (
        <SupertagInheritanceSection supertagId={node.id} />
      )}

      {activeInspectorTab === 'overview' && isSupertagDefinition && (
        <SupertagPresentationSection key={node.id} supertagId={node.id} />
      )}

      {activeInspectorTab === 'references' && isOrdinaryNode && (
        <ReferencesConfigurationSection nodeId={node.id} />
      )}

      {activeInspectorTab === 'properties' && isSearch && (
        <TanaSearchDefinitionEditor
          editor={editor}
          index={index}
          node={node.node as TanaBlockElement}
          nodeId={node.id}
          onDone={onClose}
        />
      )}

      {activeInspectorTab === 'properties' && isView && (
        <TanaViewConfigurationEditor index={index} nodeId={node.id} />
      )}
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
    <section className="tana-inspector-section">
      <h3 className="mb-3 font-medium text-[var(--still-muted)] text-[11px]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Ordinary Nodes expose only their derived properties and reference actions. */
function OrdinaryNodeProperties({
  systemFields,
}: {
  systemFields: readonly TanaFieldDescriptor[];
}) {
  return (
    <FieldSection title="摘要">
      <div className="space-y-0.5">
        {systemFields.map((field) => (
          <SystemFieldRow key={field.key} descriptor={field} />
        ))}
      </div>
      {systemFields.length === 0 && (
        <p className="text-[var(--tana-text-tertiary)] text-xs">暂无系统属性。</p>
      )}
    </FieldSection>
  );
}

function OrdinaryNodeFields({
  customFields,
  index,
  nodeId,
  supertagGroups,
}: {
  customFields: readonly TanaFieldDescriptor[];
  index: TanaIndex;
  nodeId: NodeId;
  supertagGroups: ReadonlyMap<NodeId, readonly TanaFieldDescriptor[]>;
}) {
  return (
    <FieldSection title="字段">

      {supertagGroups.size > 0 && (
        <div className="space-y-3">
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
  nodeId,
}: {
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const [addingField, setAddingField] = React.useState(false);
  const [fieldName, setFieldName] = React.useState('');
  const [error, setError] = React.useState<string>();
  const [expandedFieldId, setExpandedFieldId] = React.useState<NodeId | null>(null);
  const fields = getSupertagTemplateFields(index, nodeId);
  const existingFieldIds = new Set(fields.map((field) => field.fieldId));
  const availableDefinitions = getFieldDefinitionCandidatesFromIndex(index).filter(
    (candidate) => !existingFieldIds.has(candidate.id) && candidate.id !== nodeId
  );

  const addField = () => {
    const name = fieldName.trim();

    if (!name) return;

    const duplicate = fields.some(
      (field) => field.field.text.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0
    );

    if (duplicate) {
      setError('此标签已包含同名字段。');
      return;
    }

    const fieldId = editor.getTransforms(TanaFieldPlugin).field.createDefinition(name, { type: 'plain' });

    if (!fieldId) {
      setError('字段创建失败，请重试。');
      return;
    }

    if (!editor.getTransforms(TanaFieldPlugin).field.materialize(nodeId, fieldId)) {
      setError('字段已创建，但未能加入此超级标签模板。');
      return;
    }

    setFieldName('');
    setAddingField(false);
    setError(undefined);
  };

  return (
    <FieldSection title="字段">
      <div className="space-y-0.5">
        {fields.map((field) => {
          const expanded = expandedFieldId === field.fieldId;
          const label = field.field.text || '未命名字段';
          const templateHostNodeId = index.parentNodeIds.get(field.templateNodeId);
          const isInherited = field.inherited && templateHostNodeId !== nodeId;

          return (
            <div key={`${field.templateNodeId}:${field.fieldId}`} className="rounded-md border border-transparent hover:border-[var(--tana-divider)]">
              <div className="flex min-h-9 items-center gap-1 rounded-md px-1.5 text-xs hover:bg-[var(--tana-hover)]">
                <button
                  aria-expanded={expanded}
                  aria-label={`${expanded ? '收起' : '配置'}字段 ${label}`}
                  className="grid size-6 shrink-0 place-items-center text-[var(--tana-text-tertiary)]"
                  type="button"
                  onClick={() => setExpandedFieldId(expanded ? null : field.fieldId)}
                >
                  {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
                </button>
                <button
                  className="min-w-0 flex-1 truncate text-left text-[var(--tana-text-secondary)] hover:text-[var(--tana-link)]"
                  type="button"
                  onClick={() => setExpandedFieldId(expanded ? null : field.fieldId)}
                >
                  {label}
                </button>
                <span className="shrink-0 text-[10px] text-[var(--tana-text-tertiary)]">
                  {fieldTypeLabels[field.definition.type]}
                </span>
                {field.optional && <span className="shrink-0 rounded bg-[var(--tana-accent-soft)] px-1 text-[10px] text-[var(--tana-accent)]">可选</span>}
                {field.pinned && <span className="shrink-0 rounded bg-[var(--tana-accent-soft)] px-1 text-[10px] text-[var(--tana-accent)]">置顶</span>}
                {isInherited && (
                  <span className="shrink-0 rounded bg-[var(--tana-hover)] px-1 text-[10px] text-[var(--tana-text-tertiary)]">
                    来自 #{index.nodesById.get(field.sourceSupertagId)?.text || '父标签'}
                  </span>
                )}
                {field.overridden && (
                  <span className="shrink-0 rounded bg-[var(--tana-accent-soft)] px-1 text-[10px] text-[var(--tana-accent)]">已覆盖</span>
                )}
                {isInherited && (
                  <button
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--tana-accent)] hover:bg-[var(--tana-accent-soft)]"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editor.getTransforms(TanaFieldPlugin).field.materialize(nodeId, field.fieldId)) {
                        setExpandedFieldId(field.fieldId);
                      }
                    }}
                  >
                    在当前标签覆盖
                  </button>
                )}
                {templateHostNodeId === nodeId && (
                  <button
                    aria-label={`从超级标签移除字段 ${label}`}
                    className="grid size-6 shrink-0 place-items-center rounded text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)] hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tana-accent)]"
                    title="从当前超级标签模板移除字段"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editor.getTransforms(TanaFieldPlugin).field.removeSupertagTemplateOccurrence(nodeId, field.templateNodeId)) {
                        setExpandedFieldId(null);
                      }
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
              {expanded && (
                <div className="border-t border-[var(--tana-divider)] px-2 py-3">
                  <FieldDefinitionEditor
                    definition={field.definition}
                    fieldId={field.fieldId}
                    canEditTemplateBinding={!isInherited}
                    templateNodeId={field.templateNodeId}
                    templateHostNodeId={templateHostNodeId}
                    templateValues={field.values}
                  />
                </div>
              )}
            </div>
          );
        })}
        {addingField ? (
          <div className="tana-inspector-row flex min-h-9 items-center gap-2 rounded-md px-1.5 text-xs">
            <PlusIcon className="size-3.5 shrink-0 text-[var(--tana-accent)]" />
            <input
              aria-label="新字段名称"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[var(--tana-text)] outline-none placeholder:text-[var(--tana-text-tertiary)]"
              placeholder="字段名称…"
              value={fieldName}
              onChange={(event) => {
                setFieldName(event.currentTarget.value);
                setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addField();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setFieldName('');
                  setAddingField(false);
                  setError(undefined);
                }
              }}
            />
            <span className="shrink-0 text-[10px] text-[var(--tana-text-tertiary)]">Enter</span>
          </div>
        ) : (
          <button
            aria-label="添加字段"
            className="tana-inspector-row group flex min-h-9 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs text-[var(--tana-text-tertiary)] transition-colors hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text-secondary)]"
            type="button"
            onClick={() => {
              setAddingField(true);
              setError(undefined);
            }}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--tana-divider)] text-[var(--tana-text-tertiary)] transition-colors group-hover:border-[var(--tana-accent)] group-hover:text-[var(--tana-accent)]">
              <PlusIcon className="size-3" />
            </span>
            <span className="flex-1">添加字段…</span>
            <span className="text-[10px] opacity-0 transition-opacity group-hover:opacity-100">Enter</span>
          </button>
        )}
        {availableDefinitions.length > 0 && (
          <Select
            onValueChange={(fieldId) => {
              editor.getTransforms(TanaFieldPlugin).field.materialize(nodeId, fieldId);
              setExpandedFieldId(fieldId);
            }}
          >
            <SelectTrigger aria-label="插入已有字段" className="mt-1 h-9 w-full bg-[var(--tana-canvas)] text-left text-xs shadow-none">
              <SelectValue placeholder="插入已有字段…" />
            </SelectTrigger>
            <SelectContent>
              {availableDefinitions.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.text || '未命名字段'} · {fieldTypeLabels[candidate.fieldDefinition.type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="mt-2 text-[var(--tana-text-tertiary)] text-[11px]">
        展开字段可设置类型、数量、必填、可见性、可选、置顶、默认值、选项和完成状态映射；字段定义仍由 Schema 统一拥有。
      </p>
      {error && <p aria-live="polite" className="mt-1 text-[11px] text-destructive">{error}</p>}
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
  const templateNode = index.nodesById.get(templateNodeId);
  const templateElement = templateNode?.node as TanaBlockElement | undefined;
  const definition = templateNode?.fieldDefinition ??
    (templateElement?.tanaFieldId
      ? index.nodesById.get(templateElement.tanaFieldId)?.fieldDefinition
      : undefined);
  const hasCurrentDateInitializer =
    templateElement?.tanaFieldInitializer?.kind === 'current-date';

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
      {definition?.type === 'date' && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
          <Checkbox
            aria-label="应用时填入当天"
            checked={hasCurrentDateInitializer}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') {
                editor.getTransforms(TanaFieldPlugin).field.setInitializer(
                  templateNodeId,
                  checked ? { kind: 'current-date' } : undefined
                );
              }
            }}
          />
          应用标签时填入当天
        </label>
      )}
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

function SupertagSettingsSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="border-b border-[var(--tana-divider)] px-4 py-3" open={defaultOpen}>
      <summary className="cursor-pointer list-none font-medium text-[var(--tana-text-secondary)] text-xs marker:hidden">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
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
  const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;
  const zoom = editor.getTransforms(TanaZoomPlugin).zoom;
  const emptyValue = '__no-default-child__';
  const [shortcutLabel, setShortcutLabel] = React.useState('');
  const [shortcutTarget, setShortcutTarget] = React.useState('');
  const [shortcutCreate, setShortcutCreate] = React.useState(false);
  const [titleExpression, setTitleExpression] = React.useState(definition?.titleExpression ?? '');
  const instances = getActiveSupertagInstances(index, supertagId);
  const searchCandidates = Array.from(index.nodesById.values()).filter(
    (candidate) =>
      isTanaNodeActive(index, candidate.id) &&
      (candidate.semanticTypes.includes('search') || candidate.semanticTypes.includes('view'))
  );
  const save = (patch: Partial<SupertagDefinition>) => supertag.updateDefinitionSettings(supertagId, patch);
  const saveNested = <K extends 'ai' | 'voice' | 'relatedContent' | 'buildingBlock'>(
    key: K,
    patch: Partial<NonNullable<SupertagDefinition[K]>>
  ) => save({ [key]: { ...(definition?.[key] ?? {}), ...patch } } as Partial<SupertagDefinition>);
  const saveDoneStateMapping = (
    edge: 'checked' | 'unchecked',
    value: TanaDoneState | undefined,
  ) => {
    const mapping = { ...(definition?.doneStateMapping ?? {}) };

    if (edge === 'checked') {
      if (value) mapping.checked = value;
      else delete mapping.checked;
    } else {
      const current = new Set(mapping.unchecked ?? []);
      if (value) {
        if (current.has(value)) current.delete(value);
        else current.add(value);
      }
      mapping.unchecked = Array.from(current);
      if (mapping.unchecked.length === 0) delete mapping.unchecked;
    }

    save({ doneStateMapping: mapping });
  };
  const templateFields = getSupertagTemplateFields(index, supertagId);
  const saveCheckboxFieldMapping = (
    edge: 'checked' | 'unchecked',
    mapping: TanaSupertagCheckboxFieldMapping | undefined
  ) => {
    const next = { ...(definition?.checkboxFieldMapping ?? {}) };
    if (mapping) next[edge] = mapping;
    else delete next[edge];
    save({ checkboxFieldMapping: next });
  };
  const getMappingValueLabel = (fieldDefinition: FieldDefinition, value: FieldValue) => {
    if (value.type === 'options' || value.type === 'from-supertag') {
      return index.nodesById.get(value.value)?.text ?? '已删除选项';
    }
    if (value.type === 'checkbox') return value.value ? '已勾选' : '未勾选';
    return String(value.value);
  };
  const renderCheckboxFieldMapping = (
    edge: 'checked' | 'unchecked',
    label: string,
    mapping: TanaSupertagCheckboxFieldMapping | undefined
  ) => {
    const selectedTemplate = templateFields.find((field) => field.fieldId === mapping?.fieldId);
    const fieldDefinition = selectedTemplate?.definition;
    const candidates = selectedTemplate && (fieldDefinition?.type === 'options' || fieldDefinition?.type === 'from-supertag')
      ? getFieldValueCandidates(index, selectedTemplate.fieldId)
      : [];
    const setField = (fieldId: string) => {
      if (fieldId === '__none__') {
        saveCheckboxFieldMapping(edge, undefined);
        return;
      }
      const nextTemplate = templateFields.find((field) => field.fieldId === fieldId);
      if (!nextTemplate) return;
      const nextDefinition = nextTemplate.definition;
      const firstCandidate = (nextDefinition.type === 'options' || nextDefinition.type === 'from-supertag')
        ? getFieldValueCandidates(index, fieldId)[0]
        : undefined;
      const initialValue: FieldValue | undefined = firstCandidate
        ? { type: nextDefinition.type, value: firstCandidate.id } as FieldValue
        : nextDefinition.type === 'checkbox'
          ? { type: 'checkbox', value: edge === 'checked' }
          : undefined;
      saveCheckboxFieldMapping(
        edge,
        initialValue ? { fieldId, values: [initialValue] } : undefined
      );
    };
    const setScalar = (raw: string) => {
      if (!mapping || !fieldDefinition) return;
      let value: FieldValue;
      if (fieldDefinition.type === 'number') value = { type: 'number', value: Number(raw) };
      else value = { type: fieldDefinition.type, value: raw } as FieldValue;
      saveCheckboxFieldMapping(edge, { ...mapping, values: [value] });
    };
    const toggleCandidate = (candidateId: NodeId) => {
      if (!mapping || !fieldDefinition) return;
      const value = { type: fieldDefinition.type, value: candidateId } as FieldValue;
      const existing = mapping.values.some((item) => item.type === value.type && item.value === value.value);
      const values = existing
        ? mapping.values.filter((item) => !(item.type === value.type && item.value === value.value))
        : fieldDefinition.cardinality === 'list' ? [...mapping.values, value] : [value];
      saveCheckboxFieldMapping(edge, values.length > 0 ? { ...mapping, values } : undefined);
    };

    return (
      <div className="space-y-2 rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] p-2">
        <div className="text-xs text-[var(--tana-text-secondary)]">{label}</div>
        <Select value={mapping?.fieldId ?? '__none__'} onValueChange={setField}>
          <SelectTrigger aria-label={`${label}字段`} className="h-8 bg-[var(--tana-panel)] text-xs shadow-none"><SelectValue placeholder="不映射字段" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">不映射字段</SelectItem>
            {templateFields.map((field) => (
              <SelectItem key={field.fieldId} value={field.fieldId}>
                {field.field.text || '未命名字段'}（{field.definition.type}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mapping && fieldDefinition && (fieldDefinition.type === 'options' || fieldDefinition.type === 'from-supertag') && (
          <div className="space-y-1">
            <div className="text-[11px] text-[var(--tana-text-tertiary)]">
              {fieldDefinition.cardinality === 'list' ? '字段值（可多选）' : '字段值'}
            </div>
            {candidates.length === 0 ? (
              <p className="text-[11px] text-[var(--tana-text-tertiary)]">没有可用候选值</p>
            ) : candidates.map((candidate) => {
              const selected = mapping.values.some((value) => value.value === candidate.id);
              return (
                <label key={candidate.id} className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
                  <Checkbox checked={selected} onCheckedChange={() => toggleCandidate(candidate.id)} />
                  {candidate.text || '未命名'}
                </label>
              );
            })}
          </div>
        )}
        {mapping && fieldDefinition?.type === 'checkbox' && (
          <Select value={mapping.values[0]?.type === 'checkbox' && mapping.values[0].value ? 'true' : 'false'} onValueChange={(value) => saveCheckboxFieldMapping(edge, { ...mapping, values: [{ type: 'checkbox', value: value === 'true' }] })}>
            <SelectTrigger aria-label={`${label}复选框值`} className="h-8 bg-[var(--tana-panel)] text-xs shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="true">已勾选</SelectItem><SelectItem value="false">未勾选</SelectItem></SelectContent>
          </Select>
        )}
        {mapping && fieldDefinition && ['plain', 'date', 'email', 'number', 'url'].includes(fieldDefinition.type) && (
          <input
            aria-label={`${label}字段值`}
            className={inputClass}
            type={fieldDefinition.type === 'number' ? 'number' : 'text'}
            value={getMappingValueLabel(fieldDefinition, mapping.values[0] ?? ({ type: fieldDefinition.type, value: '' } as FieldValue))}
            onChange={(event) => setScalar(event.currentTarget.value)}
          />
        )}
      </div>
    );
  };
  const addShortcut = () => {
    const label = shortcutLabel.trim();
    if (!label) return;
    save({
      shortcuts: [
        ...(definition?.shortcuts ?? []),
        { label, targetNodeId: shortcutTarget || undefined, create: shortcutCreate },
      ],
    });
    setShortcutLabel('');
    setShortcutTarget('');
    setShortcutCreate(false);
  };

  const inputClass = 'h-8 w-full rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-xs outline-none focus:border-[var(--tana-accent)]';
  const textareaClass = 'min-h-16 w-full resize-y rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 py-1.5 text-xs outline-none focus:border-[var(--tana-accent)]';
  const titleDiagnostics = getTanaTitleExpressionDiagnostics(index, instances[0]?.id, titleExpression);
  const titlePreview = instances[0]
    ? resolveTanaTitleExpression(index, instances[0].id, titleExpression)
    : [];

  return (
    <div className="overflow-y-auto pb-6">
      <SupertagSettingsSection title="基本信息" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[var(--tana-text-secondary)]">图标<input className={inputClass} defaultValue={definition?.icon ?? ''} placeholder="#" onBlur={(event) => save({ icon: event.currentTarget.value })} /></label>
          <label className="text-xs text-[var(--tana-text-secondary)]">颜色<input className={inputClass} type="color" value={definition?.color ?? '#6b7280'} onChange={(event) => save({ color: event.currentTarget.value })} /></label>
        </div>
        <label className="block text-xs text-[var(--tana-text-secondary)]">Banner<input className={inputClass} defaultValue={definition?.banner ?? ''} placeholder="图片或颜色" onBlur={(event) => save({ banner: event.currentTarget.value })} /></label>
        <label className="block text-xs text-[var(--tana-text-secondary)]">描述<textarea className={textareaClass} defaultValue={definition?.description ?? ''} onBlur={(event) => save({ description: event.currentTarget.value })} /></label>
        <label className="block text-xs text-[var(--tana-text-secondary)]">基础类型<input className={inputClass} defaultValue={definition?.baseType ?? ''} placeholder="例如：Task" onBlur={(event) => save({ baseType: event.currentTarget.value })} /></label>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="Content template" defaultOpen>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.showCheckbox === true} onCheckedChange={(checked) => save({ showCheckbox: checked === true })} />显示复选框</label>
        <div className="space-y-2 rounded border border-[var(--tana-divider)] p-2">
          <div className="text-[11px] font-medium text-[var(--tana-text-tertiary)]">节点完成状态（可选）</div>
          <label className="block text-xs text-[var(--tana-text-secondary)]">已勾选映射<Select value={definition?.doneStateMapping?.checked ?? 'none'} onValueChange={(value) => saveDoneStateMapping('checked', value === 'none' ? undefined : value as TanaDoneState)}><SelectTrigger className="mt-1 h-8 bg-[var(--tana-canvas)] text-xs shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">不映射</SelectItem><SelectItem value="done">完成</SelectItem><SelectItem value="todo">未完成</SelectItem></SelectContent></Select></label>
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--tana-text-secondary)]">未勾选映射（可多选）</p>
            {(['todo', 'done'] as const).map((state) => (
              <label key={state} className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
                <Checkbox
                  checked={definition?.doneStateMapping?.unchecked?.includes(state) === true}
                  onCheckedChange={() => saveDoneStateMapping('unchecked', state)}
                />
                {state === 'todo' ? '未完成' : '完成'}
              </label>
            ))}
          </div>
        </div>
        {renderCheckboxFieldMapping('checked', '勾选时写入字段', definition?.checkboxFieldMapping?.checked)}
        {renderCheckboxFieldMapping('unchecked', '取消勾选时写入字段（可多值）', definition?.checkboxFieldMapping?.unchecked)}
        <label className="block text-xs text-[var(--tana-text-secondary)]">
          标题表达式
          <input
            className={inputClass}
            value={titleExpression}
            placeholder="例如：${状态} · ${name}"
            onChange={(event) => setTitleExpression(event.currentTarget.value)}
            onBlur={() => supertag.setTitleExpression(supertagId, titleExpression)}
          />
        </label>
        {titleDiagnostics.length > 0 && (
          <div aria-live="polite" className="tana-validation-warning space-y-1 rounded px-2 py-1.5 text-[11px]">
            {titleDiagnostics.map((diagnostic, diagnosticIndex) => (
              <p key={`${diagnostic.code}-${diagnosticIndex}`}>
                {diagnostic.message}{diagnostic.token ? ` ${diagnostic.token}` : ''}
              </p>
            ))}
          </div>
        )}
        <div className="rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 py-1.5 text-xs">
          <div className="mb-1 text-[11px] text-[var(--tana-text-tertiary)]">实例预览</div>
          {instances[0] ? (
            <div className="truncate text-[var(--tana-text-secondary)]">
              {titlePreview.map((segment, segmentIndex) => (
                <React.Fragment key={segmentIndex}>
                  {segment.marks?.bold ? <strong>{segment.text}</strong> : segment.marks?.italic ? <em>{segment.text}</em> : segment.text}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="text-[var(--tana-text-tertiary)]">创建实例后预览</div>
          )}
        </div>
        <p className="text-[var(--tana-text-tertiary)] text-[11px]">字段模板的默认值、可选、置顶和字段类型在“字段”分区维护。</p>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="AI and Commands">
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.ai?.autofill === true} onCheckedChange={(checked) => saveNested('ai', { autofill: checked === true })} />允许 AI 自动填充</label>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.ai?.audioEnabled === true} onCheckedChange={(checked) => saveNested('ai', { audioEnabled: checked === true })} />启用音频命令</label>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.ai?.compactMenu === true} onCheckedChange={(checked) => saveNested('ai', { compactMenu: checked === true })} />在紧凑命令菜单中显示</label>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.ai?.fullMenu === true} onCheckedChange={(checked) => saveNested('ai', { fullMenu: checked === true })} />在完整命令菜单中显示</label>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.ai?.eventCommands === true} onCheckedChange={(checked) => saveNested('ai', { eventCommands: checked === true })} />允许事件触发命令</label>
        <label className="block text-xs text-[var(--tana-text-secondary)]">AI 指令<textarea className={textareaClass} defaultValue={definition?.ai?.instructions ?? ''} onBlur={(event) => saveNested('ai', { instructions: event.currentTarget.value })} /></label>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="Voice chat">
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.voice?.enabled === true} onCheckedChange={(checked) => saveNested('voice', { enabled: checked === true })} />启用语音对话</label>
        <label className="block text-xs text-[var(--tana-text-secondary)]">欢迎语<input className={inputClass} defaultValue={definition?.voice?.greeting ?? ''} onBlur={(event) => saveNested('voice', { greeting: event.currentTarget.value })} /></label>
        <label className="block text-xs text-[var(--tana-text-secondary)]">语音指令<textarea className={textareaClass} defaultValue={definition?.voice?.instructions ?? ''} onBlur={(event) => saveNested('voice', { instructions: event.currentTarget.value })} /></label>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="Advanced options" defaultOpen>
        <label className="block text-xs text-[var(--tana-text-secondary)]"><span>默认子超级标签</span><Select value={definition?.defaultChildSupertagId ?? emptyValue} onValueChange={(value) => supertag.setDefaultChildSupertag(supertagId, value === emptyValue ? null : value)}><SelectTrigger className="mt-1 h-8 bg-[var(--tana-canvas)] text-xs shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={emptyValue}>无</SelectItem>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>#{candidate.text || '未命名'}</SelectItem>)}</SelectContent></Select></label>
        <label className="block text-xs text-[var(--tana-text-secondary)]"><span>Related content 位置</span><Select value={definition?.relatedContent?.placement ?? 'below'} onValueChange={(value) => saveNested('relatedContent', { placement: value as 'below' | 'right' })}><SelectTrigger className="mt-1 h-8 bg-[var(--tana-canvas)] text-xs shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="below">下方</SelectItem><SelectItem value="right">右侧</SelectItem></SelectContent></Select></label>
        <label className="block text-xs text-[var(--tana-text-secondary)]"><span>关联 Search / View</span><Select value={definition?.relatedContent?.searchNodeIds?.[0] ?? emptyValue} onValueChange={(value) => saveNested('relatedContent', { searchNodeIds: value === emptyValue ? [] : [value] })}><SelectTrigger className="mt-1 h-8 bg-[var(--tana-canvas)] text-xs shadow-none"><SelectValue placeholder="选择节点" /></SelectTrigger><SelectContent><SelectItem value={emptyValue}>无</SelectItem>{searchCandidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.text || '未命名节点'}</SelectItem>)}</SelectContent></Select></label>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="Shortcuts">
        {(definition?.shortcuts ?? []).map((shortcut, shortcutIndex) => <div key={`${shortcut.label}-${shortcutIndex}`} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{shortcut.label}</span><span className="text-[var(--tana-text-tertiary)]">{shortcut.targetNodeId ? (index.nodesById.get(shortcut.targetNodeId)?.text ?? '节点') : shortcut.create ? '新建' : '当前标签'}</span><button aria-label={`删除快捷入口 ${shortcut.label}`} className="text-[var(--tana-text-tertiary)] hover:text-destructive" type="button" onClick={() => save({ shortcuts: (definition?.shortcuts ?? []).filter((_, index) => index !== shortcutIndex) })}><Trash2Icon className="size-3.5" /></button></div>)}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1"><input className={inputClass} placeholder="快捷名称" value={shortcutLabel} onChange={(event) => setShortcutLabel(event.currentTarget.value)} /><Select value={shortcutTarget || emptyValue} onValueChange={(value) => setShortcutTarget(value === emptyValue ? '' : value)}><SelectTrigger className="h-8 bg-[var(--tana-canvas)] text-xs shadow-none"><SelectValue placeholder="目标节点" /></SelectTrigger><SelectContent><SelectItem value={emptyValue}>当前标签</SelectItem>{searchCandidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.text || '未命名'}</SelectItem>)}</SelectContent></Select><button className="rounded border border-[var(--tana-divider)] px-2 text-xs hover:bg-[var(--tana-hover)]" type="button" onClick={addShortcut}>添加</button></div>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={shortcutCreate} onCheckedChange={(checked) => setShortcutCreate(checked === true)} />作为新建入口</label>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="Building block">
        <label className="block text-xs text-[var(--tana-text-secondary)]">推广说明<input className={inputClass} defaultValue={definition?.buildingBlock?.promoteFor ?? ''} onBlur={(event) => saveNested('buildingBlock', { promoteFor: event.currentTarget.value })} /></label>
        <label className="flex items-center gap-2 text-xs text-[var(--tana-text-secondary)]"><Checkbox checked={definition?.buildingBlock?.hiddenFromSearch === true} onCheckedChange={(checked) => saveNested('buildingBlock', { hiddenFromSearch: checked === true })} />从搜索和菜单隐藏</label>
        <div className="space-y-1.5">
          <div className="text-xs text-[var(--tana-text-secondary)]">建议关联的超级标签</div>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-[var(--tana-divider)] p-1.5">
            {candidates.map((candidate) => {
              const selected = definition?.buildingBlock?.suggestedSupertagIds?.includes(candidate.id) === true;
              return (
                <label key={candidate.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)]">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => {
                      const current = definition?.buildingBlock?.suggestedSupertagIds ?? [];
                      const next = checked === true
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id);
                      saveNested('buildingBlock', { suggestedSupertagIds: next });
                    }}
                  />
                  <span className="truncate">#{candidate.text || '未命名'}</span>
                </label>
              );
            })}
            {candidates.length === 0 && <span className="px-1 text-[11px] text-[var(--tana-text-tertiary)]">暂无其他超级标签</span>}
          </div>
        </div>
      </SupertagSettingsSection>

      <SupertagSettingsSection title="生命周期" defaultOpen>
        <button className="flex min-h-8 w-full items-center justify-between rounded border border-[var(--tana-divider)] px-2 text-left text-xs hover:bg-[var(--tana-hover)]" type="button" onClick={() => instances[0] && zoom.to(instances[0].id)}><span>查看全部实例</span><span className="text-[var(--tana-text-tertiary)]">{instances.length}</span></button>
        <button className="flex min-h-8 w-full items-center justify-between rounded border border-destructive/40 px-2 text-left text-xs text-destructive hover:bg-destructive/10" type="button" onClick={() => lifecycle.trash(supertagId)}><span>移至回收站</span><span>可恢复</span></button>
      </SupertagSettingsSection>
    </div>
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
  const index = useTanaIndex();
  const values = descriptor.fieldNodeId ? index.fieldNodesById.get(descriptor.fieldNodeId)?.valueNodeIds ?? [] : [];
  const presentation = editor.getTransforms(TanaPresentationPlugin).presentation;
  const zoom = editor.getTransforms(TanaZoomPlugin).zoom;
  const lifecycle = editor.getTransforms(TanaNodeLifecyclePlugin).node;

  if (descriptor.brokenFieldDefinition) {
    return (
      <div className="tana-inspector-row group flex min-h-9 items-center gap-2 rounded-md px-1.5 text-xs text-[var(--tana-text-tertiary)]">
        <span className="min-w-0 flex-1 truncate" role="status">{descriptor.label}</span>
        {descriptor.fieldDefinitionInTrash && descriptor.fieldId && (
          <button
            aria-label="恢复字段定义"
            className="rounded px-1 py-0.5 text-[11px] text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
            type="button"
            onClick={() => lifecycle.restore(descriptor.fieldId!)}
          >
            恢复
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tana-inspector-row tana-property-row group">
      <button
        className={
          descriptor.visible
            ? 'tana-property-label truncate text-left hover:text-[var(--tana-link)]'
            : 'tana-property-label truncate text-left text-[var(--tana-text-tertiary)] line-through hover:text-[var(--tana-text-secondary)]'
        }
        title="打开字段定义"
        type="button"
        onClick={() => descriptor.fieldId && zoom.to(descriptor.fieldId)}
      >
        {descriptor.label}
      </button>
      {values.length > 0 && <div className="tana-property-values">
        {values.map((valueId) => <TanaFieldValueEditor key={valueId} index={index} nodeId={valueId} inline />)}
      </div>}
      <button
        className="tana-property-action opacity-0 text-[var(--tana-text-tertiary)] text-[10px] transition-opacity hover:text-[var(--tana-text)] focus:opacity-100 group-hover:opacity-100"
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
  canEditTemplateBinding = true,
  templateNodeId,
  templateHostNodeId,
  templateValues,
}: {
  definition: FieldDefinition;
  fieldId: NodeId;
  canEditTemplateBinding?: boolean;
  /** When present, this editor is editing a Supertag template binding too. */
  templateNodeId?: NodeId;
  templateHostNodeId?: NodeId;
  templateValues?: readonly FieldValue[];
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const [cardinalityNotice, setCardinalityNotice] = React.useState<string>();
  const [typeChangeNotice, setTypeChangeNotice] = React.useState<string>();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const supertags = Array.from(index.nodesById.values()).filter(
    (node) =>
      isTanaNodeActive(index, node.id) &&
      node.semanticTypes.includes('supertag-definition')
  );

  const changeType = (type: FieldType) => {
    if (type === definition.type) return;

    const shared = {
      ...(definition.cardinality === 'list' ? { cardinality: 'list' as const } : {}),
      ...(definition.required === true ? { required: true as const } : {}),
      ...(definition.visibility ? { visibility: definition.visibility } : {}),
    };
    const nextDefinition: FieldDefinition =
      type === 'from-supertag'
        ? { ...shared, sourceSupertagId: null, type }
        : { ...shared, type };

    const updated = fieldTransforms.updateDefinition(fieldId, nextDefinition);

    if (updated) {
      setTypeChangeNotice(
        '已切换字段类型。原类型的专属设置已清除；通用设置（必填、可见性和多值）已保留。'
      );
    }
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

  const setVisibilityPolicy = (visibility: FieldVisibilityPolicy) => {
    const next = { ...definition } as FieldDefinition & {
      visibility?: FieldVisibilityPolicy;
    };

    if (visibility === 'never') delete next.visibility;
    else next.visibility = visibility;

    fieldTransforms.updateDefinition(fieldId, next);
  };

  const setDoneStateMapping = (
    edge: 'checked' | 'unchecked',
    value: TanaDoneState | undefined,
  ) => {
    if (definition.type !== 'checkbox') return;

    const next = { ...definition };
    const mapping = { ...(definition.doneStateMapping ?? {}) };

    if (value === undefined) delete mapping[edge];
    else mapping[edge] = value;

    if (Object.keys(mapping).length === 0) delete next.doneStateMapping;
    else next.doneStateMapping = mapping;

    fieldTransforms.updateDefinition(fieldId, next);
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
        <SelectTrigger aria-label="字段类型" className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
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
      {typeChangeNotice && (
        <p className="tana-validation-warning mt-2 rounded px-2 py-1 text-xs" role="status">
          {typeChangeNotice}
        </p>
      )}

      <div className="mt-3">
        <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">字段值数量</p>
        <Select
          value={definition.cardinality ?? 'single'}
          onValueChange={(value) => setCardinality(value as 'list' | 'single')}
        >
          <SelectTrigger aria-label="字段值数量" className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">单个值</SelectItem>
            <SelectItem value="list">多个值</SelectItem>
          </SelectContent>
        </Select>
        {cardinalityNotice && (
          <p className="tana-validation-warning mt-1.5 rounded px-2 py-1 text-xs" role="status">
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

      <div className="mt-3">
        <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">字段可见性</p>
        <Select
          value={definition.visibility ?? 'never'}
          onValueChange={(value) => setVisibilityPolicy(value as FieldVisibilityPolicy)}
        >
          <SelectTrigger aria-label="字段可见性" className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(fieldVisibilityPolicyLabels) as FieldVisibilityPolicy[]).map(
              (policy) => (
                <SelectItem key={policy} value={policy}>
                  {fieldVisibilityPolicyLabels[policy]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {definition.type === 'checkbox' && (
        <div className="mt-3 rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] p-2.5">
          <p className="mb-2 text-[var(--tana-text-tertiary)] text-[11px]">完成状态映射</p>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--tana-text-secondary)]">
              <span>勾选时</span>
              <Select
                value={definition.doneStateMapping?.checked ?? 'none'}
                onValueChange={(value) =>
                  setDoneStateMapping('checked', value === 'none' ? undefined : value as TanaDoneState)
                }
              >
                <SelectTrigger aria-label="勾选时完成状态" className="h-8 w-32 bg-[var(--tana-panel)] text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不改变</SelectItem>
                  <SelectItem value="todo">未完成</SelectItem>
                  <SelectItem value="done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--tana-text-secondary)]">
              <span>取消勾选时</span>
              <Select
                value={definition.doneStateMapping?.unchecked ?? 'none'}
                onValueChange={(value) =>
                  setDoneStateMapping('unchecked', value === 'none' ? undefined : value as TanaDoneState)
                }
              >
                <SelectTrigger aria-label="取消勾选时完成状态" className="h-8 w-32 bg-[var(--tana-panel)] text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不改变</SelectItem>
                  <SelectItem value="todo">未完成</SelectItem>
                  <SelectItem value="done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <p className="mt-2 text-[10px] text-[var(--tana-text-tertiary)]">字段值变化时同步节点的完成状态。</p>
        </div>
      )}

      {definition.type === 'from-supertag' && (
        <div className="mt-3">
          <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">候选来源</p>
          <Select
            value={definition.sourceSupertagId ?? '__no-source-supertag__'}
            onValueChange={(sourceSupertagId) =>
              fieldTransforms.updateDefinition(fieldId, {
                ...(definition.cardinality === 'list' ? { cardinality: 'list' as const } : {}),
                ...(definition.required === true ? { required: true as const } : {}),
                ...(definition.visibility ? { visibility: definition.visibility } : {}),
                sourceSupertagId: sourceSupertagId === '__no-source-supertag__' ? null : sourceSupertagId,
                type: 'from-supertag',
              })
            }
          >
            <SelectTrigger className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
              <SelectValue placeholder="选择超级标签" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__no-source-supertag__">无来源（稍后选择）</SelectItem>
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
        <TemplateOptionsEditor fieldId={fieldId} />
      )}

      {definition.type === 'number' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[var(--tana-text-tertiary)] text-[11px]">
            最小值
            <input
              className="mt-1 h-8 w-full rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-[var(--tana-text-secondary)] text-xs outline-none focus:border-[var(--tana-accent)] focus:ring-1 focus:ring-[var(--tana-accent-soft)]"
              defaultValue={definition.min ?? ''}
              inputMode="decimal"
              step="any"
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
              step="any"
              type="number"
              onBlur={(event) => updateNumberBoundary('max', event.currentTarget.value)}
            />
          </label>
        </div>
      )}

      {templateNodeId && (
        <SupertagTemplateBindingSettings
          definition={definition}
          fieldId={fieldId}
          canEditTemplateBinding={canEditTemplateBinding}
          templateHostNodeId={templateHostNodeId}
          templateNodeId={templateNodeId}
          templateValues={templateValues ?? []}
        />
      )}
    </FieldSection>
  );
}

function SupertagTemplateBindingSettings({
  definition,
  fieldId,
  canEditTemplateBinding,
  templateHostNodeId,
  templateNodeId,
  templateValues,
}: {
  definition: FieldDefinition;
  fieldId: NodeId;
  canEditTemplateBinding: boolean;
  templateHostNodeId?: NodeId;
  templateNodeId: NodeId;
  templateValues: readonly FieldValue[];
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const templateNode = index.nodesById.get(templateNodeId);
  const field = editor.getTransforms(TanaFieldPlugin).field;
  const canSetDefault = canEditTemplateBinding && !!templateHostNodeId && !!index.fieldNodesById.get(templateNodeId);
  const initializer = (templateNode?.node as TanaBlockElement | undefined)?.tanaFieldInitializer;

  return (
    <div className="mt-4 border-t border-[var(--tana-divider)] pt-3">
      <p className="mb-2 font-medium text-[var(--still-muted)] text-[11px]">模板行为</p>
      {!canEditTemplateBinding && (
        <p className="mb-2 rounded bg-[var(--tana-hover)] px-2 py-1.5 text-[11px] text-[var(--tana-text-tertiary)]">
          此字段继承自父标签。先点击“在当前标签覆盖”，再修改可选、置顶和默认值。
        </p>
      )}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
          <Checkbox
            aria-label="设为可选字段"
            disabled={!canEditTemplateBinding}
            checked={templateNode?.node.tanaFieldOptional === true}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') field.setOptional(templateNodeId, checked);
            }}
          />
          可选字段（应用标签时不自动添加）
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--tana-text-secondary)]">
          <Checkbox
            aria-label="设为置顶字段"
            disabled={!canEditTemplateBinding}
            checked={templateNode?.node.tanaFieldPinned === true}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') field.setPinned(templateNodeId, checked);
            }}
          />
          置顶显示
        </label>
        {definition.type === 'date' && (
          <div>
            <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">默认日期</p>
            <Select
              disabled={!canEditTemplateBinding}
              value={initializer?.kind ?? 'none'}
              onValueChange={(value) =>
                field.setInitializer(
                  templateNodeId,
                  value === 'none'
                    ? undefined
                    : { kind: value as 'current-date' | 'ancestor-calendar-day' }
                )
              }
            >
              <SelectTrigger aria-label="选择默认日期" className="h-8 w-full bg-[var(--tana-canvas)] text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不自动填充</SelectItem>
                <SelectItem value="current-date">应用时填入当天</SelectItem>
                <SelectItem value="ancestor-calendar-day">使用所在日历日期</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-[var(--tana-text-tertiary)] text-[11px]">默认值</p>
          {canSetDefault ? (
            <TemplateDefaultValueEditor
              definition={definition}
              fieldId={fieldId}
              hostNodeId={templateHostNodeId!}
              index={index}
              values={templateValues}
            />
          ) : (
            <p className="rounded bg-[var(--tana-hover)] px-2 py-1.5 text-[11px] text-[var(--tana-text-tertiary)]">
              当前字段是定义节点。插入已有字段后才能保存模板默认值。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateDefaultValueEditor({
  definition,
  fieldId,
  hostNodeId,
  index,
  values,
}: {
  definition: FieldDefinition;
  fieldId: NodeId;
  hostNodeId: NodeId;
  index: TanaIndex;
  values: readonly FieldValue[];
}) {
  const editor = useEditorRef();
  const field = editor.getTransforms(TanaFieldPlugin).field;
  const current = values[0];
  const currentText = current && ['plain', 'number', 'date', 'email', 'url'].includes(current.type)
    ? String(current.value)
    : '';
  const options = definition.type === 'options' || definition.type === 'from-supertag'
    ? getFieldValueCandidates(index, fieldId)
    : [];
  const optionValue = current && (current.type === 'options' || current.type === 'from-supertag')
    ? current.value
    : undefined;

  const setValue = (value: FieldValue) => {
    if (definition.cardinality === 'list' && values.length > 0) {
      const fieldNode = index.fieldNodesById.get(
        index.childrenByParent.get(hostNodeId)?.find((id) => index.fieldNodesById.get(id)?.fieldId === fieldId) ?? ''
      );
      const valueNodeId = fieldNode?.valueNodeIds[0];
      if (valueNodeId) field.setValueAt(hostNodeId, fieldId, valueNodeId, value);
      else field.addValue(hostNodeId, fieldId, value);
    } else if (definition.cardinality === 'list') {
      field.addValue(hostNodeId, fieldId, value);
    } else {
      field.setValue(hostNodeId, fieldId, value);
    }
  };

  const clear = () => field.clearValue(hostNodeId, fieldId);

  if (definition.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label="默认复选框值"
          checked={current?.type === 'checkbox' ? current.value : false}
          onCheckedChange={(checked) => {
            if (typeof checked === 'boolean') setValue({ type: 'checkbox', value: checked });
          }}
        />
        <span className="text-xs text-[var(--tana-text-secondary)]">{current?.type === 'checkbox' ? (current.value ? '已完成' : '未完成') : '未设置'}</span>
        {current && <button aria-label="清除默认值" className="text-[var(--tana-text-tertiary)] text-[11px]" type="button" onClick={clear}>清除</button>}
      </div>
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    return (
      <div className="flex items-center gap-2">
        <Select value={optionValue} onValueChange={(value) => setValue({ type: definition.type, value } as FieldValue)}>
          <SelectTrigger
            aria-label={definition.type === 'options' ? '默认选项' : '默认关联节点'}
            className="h-8 min-w-0 flex-1 bg-[var(--tana-canvas)] text-xs shadow-none"
          >
            <SelectValue placeholder="未设置" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.text || '未命名节点'}</SelectItem>)}
          </SelectContent>
        </Select>
        {current && <button aria-label="清除默认值" className="text-[var(--tana-text-tertiary)] text-[11px]" type="button" onClick={clear}>清除</button>}
      </div>
    );
  }

  const defaultInput = (() => {
    const commonProps = {
      'aria-label': '模板默认值',
      className: 'h-8 min-w-0 flex-1 rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-xs outline-none focus:border-[var(--tana-accent)]',
      defaultValue: currentText,
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        const raw = event.currentTarget.value.trim();

        if (!raw) {
          clear();
          return;
        }

        if (definition.type === 'number') {
          const number = Number(raw);

          if (Number.isFinite(number)) {
            setValue({ type: 'number', value: number });
          }

          return;
        }

        setValue({ type: definition.type, value: raw } as FieldValue);
      },
    };

    if (definition.type === 'number') {
      return (
        <input
          {...commonProps}
          aria-label="模板默认数字"
          inputMode="decimal"
          max={definition.max}
          min={definition.min}
          step="any"
          type="number"
        />
      );
    }

    if (definition.type === 'date') {
      return (
        <input
          {...commonProps}
          aria-label="模板默认日期"
          placeholder="YYYY-MM-DD / YYYY-Www / YYYY-MM / range"
          type="text"
        />
      );
    }

    if (definition.type === 'email') {
      return (
        <input
          {...commonProps}
          aria-label="模板默认邮箱"
          autoComplete="email"
          inputMode="email"
          type="email"
        />
      );
    }

    if (definition.type === 'url') {
      return (
        <input
          {...commonProps}
          aria-label="模板默认网址"
          autoComplete="url"
          inputMode="url"
          type="url"
        />
      );
    }

    return <input {...commonProps} />;
  })();

  return (
    <div className="flex items-center gap-2">
      {defaultInput}
      {current && <button aria-label="清除默认值" className="text-[var(--tana-text-tertiary)] text-[11px]" type="button" onClick={clear}>清除</button>}
    </div>
  );
}

function TemplateOptionsEditor({ fieldId }: { fieldId: NodeId }) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const [name, setName] = React.useState('');
  const [pendingDeleteId, setPendingDeleteId] = React.useState<NodeId | null>(null);
  const options = (index.childrenByParent.get(fieldId) ?? []).flatMap((id) => {
    const node = index.nodesById.get(id);
    return node?.semanticTypes.includes('option') ? [node] : [];
  });
  const field = editor.getTransforms(TanaFieldPlugin).field;
  const usageCount = options.reduce(
    (total, option) => total + countTanaFieldOptionUsages(index, fieldId, option.id),
    0,
  );

  const create = () => {
    const normalized = name.trim();
    if (!normalized) return;
    field.createOption(fieldId, normalized);
    setName('');
  };

  return (
    <div className="mt-3 border-t border-[var(--tana-divider)] pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[var(--tana-text-tertiary)] text-[11px]">选项</p>
        {usageCount > 0 && (
          <span className="text-[10px] text-[var(--tana-text-tertiary)]">已有 {usageCount} 个值在使用</span>
        )}
      </div>
      <div className="space-y-1">
        {options.map((option) => {
          const uses = countTanaFieldOptionUsages(index, fieldId, option.id);
          const pending = pendingDeleteId === option.id;

          return (
            <div key={option.id} className="rounded border border-transparent px-1 py-1 hover:border-[var(--tana-divider)]">
              <div className="flex min-h-7 items-center gap-2 text-xs">
                <button className="min-w-0 flex-1 truncate text-left text-[var(--tana-text-secondary)] hover:text-[var(--tana-link)]" type="button" onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(option.id)}>
                  {option.text || '未命名选项'}
                </button>
                {uses > 0 && <span className="shrink-0 text-[10px] text-[var(--tana-text-tertiary)]">{uses} 个值</span>}
                {pending ? (
                  <>
                    <button
                      aria-label={`确认删除选项 ${option.text || '未命名选项'}`}
                      className="shrink-0 rounded px-1 text-[10px] text-destructive hover:bg-destructive/10"
                      type="button"
                      onClick={() => {
                        field.removeOption(fieldId, option.id);
                        setPendingDeleteId(null);
                      }}
                    >
                      确认删除
                    </button>
                    <button
                      aria-label="取消删除选项"
                      className="shrink-0 rounded px-1 text-[var(--tana-text-tertiary)] hover:bg-[var(--tana-hover)]"
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </>
                ) : (
                  <button
                    aria-label={`删除选项 ${option.text || '未命名选项'}`}
                    className="shrink-0 text-[var(--tana-text-tertiary)] hover:text-destructive"
                    title={uses > 0 ? `已有 ${uses} 个值使用，删除后将标记为无效` : '删除选项'}
                    type="button"
                    onClick={() => setPendingDeleteId(option.id)}
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                )}
              </div>
              {pending && uses > 0 && (
                <p className="mt-1 text-[10px] text-[var(--tana-text-tertiary)]" role="status">
                  已有值不会被删除；删除后会显示为“选项不在当前候选中”，可重新选择有效选项。
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input aria-label="新增选项" className="h-8 min-w-0 flex-1 rounded border border-[var(--tana-divider)] bg-[var(--tana-canvas)] px-2 text-xs outline-none focus:border-[var(--tana-accent)]" placeholder="新增选项…" value={name} onChange={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); create(); } }} />
        <button aria-label="添加选项" className="text-[var(--tana-link)] text-xs" type="button" onClick={create}>添加</button>
      </div>
    </div>
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
