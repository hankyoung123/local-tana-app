'use client';

import * as React from 'react';

import type { PlateEditor } from 'platejs/react';

import {
  ArrowUpRightIcon,
  HashIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-react';

import type {
  FieldDefinition,
  FieldType,
  FieldValue,
  FieldValueState,
  NodeId,
  TanaBlockElement,
  TanaIndex,
  TanaNode,
} from '@/lib/tana';
import {
  getFieldValueCandidates,
  getNodeSupertagIds,
  getSupertagFieldBindings,
  isFieldDefined,
  isAdHocField,
  isFieldValueCompatible,
} from '@/lib/tana';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { TanaViewDefinitionEditor } from './tana-view-editor';
import { useTanaIndex } from './tana-index-context';

const EMPTY_VALUE = '__local_tana_empty__';

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

type TanaInspectorProps = {
  activeNodeId: NodeId | null;
  editor: PlateEditor;
};

export function TanaInspector({
  activeNodeId,
  editor,
}: TanaInspectorProps) {
  const index = useTanaIndex();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const supertagTransforms = editor.getTransforms(TanaSupertagPlugin).supertag;
  const selectedNode = activeNodeId
    ? index.nodesById.get(activeNodeId)
    : undefined;

  if (!selectedNode) {
    return (
      <aside className="hidden h-full w-72 shrink-0 border-l bg-[#fafbfa] p-5 xl:block">
        <p className="text-muted-foreground text-xs">
          选择一个节点以查看它的 Tana 语义。
        </p>
      </aside>
    );
  }

  const supertagIds = getNodeSupertagIds(index, selectedNode.id);
  const appliedSupertags = supertagIds.flatMap((supertagId) => {
    const supertag = index.nodesById.get(supertagId);

    return supertag?.supertagDefinition ? [supertag] : [];
  });
  const fieldBindings = supertagIds.flatMap((supertagId) =>
    getSupertagFieldBindings(index, supertagId)
  );
  const definedFields = Array.from(
    new Set([
      ...fieldBindings.map(({ field }) => field.id),
      ...Object.keys(selectedNode.fieldValues ?? {}),
    ])
  ).flatMap((fieldId) => {
    const field = index.nodesById.get(fieldId);

    return field?.fieldDefinition &&
      isFieldDefined(index, selectedNode.id, fieldId)
      ? [field]
      : [];
  });
  const backlinks = index.backlinks.get(selectedNode.id) ?? [];

  return (
    <aside className="hidden h-full w-72 shrink-0 overflow-y-auto border-l bg-[#fafbfa] xl:block">
      <div className="border-b p-5">
        <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          检查器
        </p>
        <h2 className="truncate font-semibold text-sm">{selectedNode.text}</h2>
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {selectedNode.id}
        </p>
      </div>

      <InspectorSection icon={<HashIcon />} title="超级标签">
        {supertagIds.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            在节点中输入 # 即可应用超级标签。
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {supertagIds.map((supertagId) => (
              <span
                key={supertagId}
                className="inline-flex items-center rounded bg-emerald-50 pl-2 text-emerald-800 text-xs"
              >
                #{index.nodesById.get(supertagId)?.text ?? supertagId}
                <button
                  className="ml-1 rounded p-1 hover:bg-emerald-100"
                  type="button"
                  aria-label={`移除 ${supertagId}`}
                  onClick={() =>
                    supertagTransforms.remove(selectedNode.id, supertagId)
                  }
                >
                  <Trash2Icon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </InspectorSection>

      <InspectorSection icon={<TagIcon />} title="字段">
        {definedFields.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            在空节点中输入 &gt; 即可直接添加字段。
          </p>
        ) : (
          <div className="space-y-3">
            {definedFields.map((field) => {
              const isDirectField = isAdHocField(
                index,
                selectedNode.id,
                field.id
              );

              return (
                <FieldControl
                  key={field.id}
                  addToTemplate={
                    isDirectField ? (
                      <AddFieldToTemplateAction
                        editor={editor}
                        fieldId={field.id}
                        nodeId={selectedNode.id}
                        supertags={appliedSupertags}
                        value={selectedNode.fieldValues?.[field.id]}
                      />
                    ) : undefined
                  }
                  definition={field.fieldDefinition!}
                  index={index}
                  label={field.text || field.id}
                  value={selectedNode.fieldValues?.[field.id]}
                  onChange={(value) =>
                    fieldTransforms.setValue(selectedNode.id, field.id, value)
                  }
                  onClear={() =>
                    fieldTransforms.clearValue(selectedNode.id, field.id)
                  }
                  onRemove={
                    isDirectField
                      ? () => fieldTransforms.deleteAdHoc(selectedNode.id, field.id)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </InspectorSection>

      {selectedNode.fieldDefinition && (
        <FieldDefinitionEditor
          editor={editor}
          index={index}
          node={selectedNode}
        />
      )}

      <InspectorSection icon={<ArrowUpRightIcon />} title="反向引用">
        {backlinks.length === 0 ? (
          <p className="text-muted-foreground text-xs">暂无引用。</p>
        ) : (
          <div className="space-y-1">
            {backlinks.map((backlink, indexInList) => {
              const sourceNode = index.nodesById.get(backlink.sourceNodeId);

              return (
                <button
                  key={`${backlink.sourceNodeId}:${indexInList}`}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  type="button"
                  onClick={() =>
                    editor
                      .getTransforms(TanaZoomPlugin)
                      .zoom.to(backlink.sourceNodeId)
                  }
                >
                  <ArrowUpRightIcon className="mt-0.5 size-3 shrink-0" />
                  <span className="line-clamp-2">
                    {sourceNode?.text ?? backlink.sourceNodeId}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </InspectorSection>

      <SupertagDefinitionEditor
        editor={editor}
        index={index}
        node={selectedNode}
      />
      <TanaViewDefinitionEditor
        editor={editor}
        index={index}
        node={selectedNode.node as TanaBlockElement}
        nodeId={selectedNode.id}
      />
    </aside>
  );
}

function AddFieldToTemplateAction({
  editor,
  fieldId,
  nodeId,
  supertags,
  value,
}: {
  editor: PlateEditor;
  fieldId: NodeId;
  nodeId: NodeId;
  supertags: readonly TanaNode[];
  value?: FieldValueState;
}) {
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const addToTemplate = (supertagId: NodeId) => {
    if (!fieldTransforms.bind(supertagId, fieldId)) return;

    // A binding already expresses Defined + Not Set. Keep real FieldValues.
    if (value === null) fieldTransforms.deleteAdHoc(nodeId, fieldId);
  };

  if (supertags.length === 0) return null;

  if (supertags.length === 1) {
    return (
      <button
        className="text-[10px] text-muted-foreground hover:text-foreground"
        type="button"
        onClick={() => addToTemplate(supertags[0].id)}
      >
        添加到模板
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground"
          type="button"
        >
          添加到模板
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supertags.map((supertag) => (
          <DropdownMenuItem
            key={supertag.id}
            onSelect={() => addToTemplate(supertag.id)}
          >
            #{supertag.text || supertag.id}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InspectorSection({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="border-b p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em] [&_svg]:size-3.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldControl({
  addToTemplate,
  definition,
  index,
  label,
  onChange,
  onClear,
  onRemove,
  value,
}: {
  addToTemplate?: React.ReactNode;
  definition: FieldDefinition;
  index: TanaIndex;
  label: string;
  onChange: (value: FieldValue) => void;
  onClear: () => void;
  onRemove?: () => void;
  value?: FieldValueState;
}) {
  const compatibleValue =
    value && isFieldValueCompatible(definition, value) ? value : undefined;
  const clearButton = compatibleValue ? (
    <button
      className="text-[10px] text-muted-foreground hover:text-foreground"
      type="button"
      onClick={onClear}
    >
      清除
    </button>
  ) : null;
  const removeButton = onRemove ? (
    <button
      className="text-muted-foreground hover:text-destructive"
      type="button"
      aria-label={`移除字段 ${label}`}
      onClick={onRemove}
    >
      <Trash2Icon className="size-3" />
    </button>
  ) : null;
  const actions = (
    <span className="flex items-center gap-2">
      {addToTemplate}
      {clearButton}
      {removeButton}
    </span>
  );
  const labelElement = (
    <span className="mb-1.5 block font-medium text-[11px] text-muted-foreground">
      {label}
    </span>
  );

  if (definition.type === 'checkbox') {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          {actions}
          <Checkbox
            checked={compatibleValue?.type === 'checkbox' ? compatibleValue.value : false}
            onCheckedChange={(checked) =>
              onChange({ type: 'checkbox', value: checked === true })
            }
          />
        </div>
      </div>
    );
  }

  if (
    definition.type === 'options' ||
    definition.type === 'from-supertag'
  ) {
    const currentValue =
      compatibleValue?.type === definition.type
        ? compatibleValue.value
        : EMPTY_VALUE;
    const options = getFieldValueCandidates(index, definition).map((node) => ({
      label: node.text || node.id,
      value: node.id,
    }));

    return (
      <label className="block">
        <span className="flex items-center justify-between">
          {labelElement}
          {actions}
        </span>
        <Select
          value={currentValue}
          onValueChange={(nextValue) => {
            if (nextValue === EMPTY_VALUE) return onClear();

            onChange({ type: definition.type, value: nextValue });
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="未设置" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_VALUE}>未设置</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }

  const currentValue =
    compatibleValue?.type === definition.type ? compatibleValue.value : '';

  return (
    <label className="block">
      <span className="flex items-center justify-between">
          {labelElement}
          {actions}
      </span>
      <Input
        className="h-8 text-xs"
        type={
          definition.type === 'number'
            ? 'number'
            : definition.type === 'date'
              ? 'date'
              : 'text'
        }
        value={currentValue}
        onChange={(event) => {
          if (event.target.value === '') return onClear();

          if (definition.type === 'number') {
            const numericValue = event.target.valueAsNumber;

            if (!Number.isNaN(numericValue)) {
              onChange({ type: 'number', value: numericValue });
            }

            return;
          }

          onChange({ type: definition.type, value: event.target.value });
        }}
      />
    </label>
  );
}

function FieldDefinitionEditor({
  editor,
  index,
  node,
}: {
  editor: PlateEditor;
  index: TanaIndex;
  node: TanaNode;
}) {
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const definition = node.fieldDefinition!;
  const supertags = Array.from(index.nodesById.values()).filter(
    (candidate) => !!candidate.supertagDefinition
  );
  const [optionName, setOptionName] = React.useState('');
  const optionNodes =
    definition.type === 'options'
      ? definition.options.flatMap((optionId) => {
          const option = index.nodesById.get(optionId);

          return option ? [option] : [];
        })
      : [];

  const updateDefinition = (nextDefinition: FieldDefinition) => {
    fieldTransforms.updateDefinition(node.id, nextDefinition);
  };

  const updateType = (type: FieldType) => {
    if (type === 'options') {
      updateDefinition({ options: [], type });
      return;
    }

    if (type === 'from-supertag') {
      updateDefinition({ sourceSupertagId: supertags[0]?.id ?? null, type });

      return;
    }

    updateDefinition({ type });
  };

  return (
    <InspectorSection icon={<TagIcon />} title="字段定义">
      <p className="mb-3 text-muted-foreground text-xs">
        字段名称直接编辑当前节点文本；该节点 ID 就是字段 ID。
      </p>
      <Select
        value={definition.type}
        onValueChange={(value) => updateType(value as FieldType)}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {fieldTypeLabels[type]}
              </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {definition.type === 'options' && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">选项节点</p>
          {optionNodes.map((option) => {
            return (
              <div
                key={option.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate">{option.text || option.id}</span>
                <button
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  type="button"
                  aria-label={`删除选项 ${option.text || option.id}`}
                  onClick={() => fieldTransforms.removeOption(node.id, option.id)}
                >
                  <Trash2Icon className="size-3" />
                </button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              value={optionName}
              placeholder="新选项"
              onChange={(event) => setOptionName(event.target.value)}
            />
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={!optionName.trim()}
              onClick={() => {
                if (fieldTransforms.createOption(node.id, optionName)) {
                  setOptionName('');
                }
              }}
            >
              添加
            </Button>
          </div>
        </div>
      )}

      {definition.type === 'from-supertag' && (
        <Select
          value={definition.sourceSupertagId ?? EMPTY_VALUE}
          onValueChange={(sourceSupertagId) =>
            updateDefinition({
              sourceSupertagId:
                sourceSupertagId === EMPTY_VALUE ? null : sourceSupertagId,
              type: 'from-supertag',
            })
          }
        >
          <SelectTrigger className="mt-3 h-8 w-full text-xs">
            <SelectValue placeholder="来源：未选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_VALUE}>来源：未选择</SelectItem>
            {supertags.map((supertag) => (
              <SelectItem key={supertag.id} value={supertag.id}>
                #{supertag.text || supertag.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </InspectorSection>
  );
}

function SupertagDefinitionEditor({
  editor,
  index,
  node,
}: {
  editor: PlateEditor;
  index: TanaIndex;
  node: TanaNode;
}) {
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const supertagTransforms = editor.getTransforms(TanaSupertagPlugin).supertag;
  const [fieldName, setFieldName] = React.useState('');
  const [fieldType, setFieldType] = React.useState<FieldType>('plain');
  const [sourceSupertagId, setSourceSupertagId] = React.useState('');
  const definition = node.supertagDefinition;
  const supertags = Array.from(index.nodesById.values()).filter(
    (candidate) => !!candidate.supertagDefinition && candidate.id !== node.id
  );

  if (!definition) {
    return (
      <div className="p-5">
        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={() => supertagTransforms.define(node.id)}
        >
          <HashIcon />
          定义为超级标签
        </Button>
      </div>
    );
  }

  const resolvedBindings = getSupertagFieldBindings(index, node.id);
  const createAndBindField = () => {
    const name = fieldName.trim();
    const fieldDefinition = createDefinition(
      fieldType,
      sourceSupertagId || supertags[0]?.id
    );

    if (!name) return;

    const fieldId = fieldTransforms.createDefinition(
      name,
      fieldDefinition,
      node.id
    );

    if (fieldId) fieldTransforms.bind(node.id, fieldId);

    setFieldName('');
  };

  const updateDefault = (fieldId: NodeId, defaultValue?: FieldValue) => {
    fieldTransforms.setBindingDefault(node.id, fieldId, defaultValue);
  };

  return (
    <section className="p-5">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          <HashIcon className="size-3.5" />
          超级标签定义
        </h3>
      </div>

      <div className="mb-4 space-y-3">
        {resolvedBindings.map(({ binding, definition: fieldDefinition, field }) => (
          <div key={field.id} className="rounded bg-white p-2">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{field.text || field.id}</span>
              <span className="text-[10px] text-muted-foreground">
                {fieldTypeLabels[fieldDefinition.type]}
              </span>
              <button
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                type="button"
                aria-label={`移除字段绑定 ${field.text || field.id}`}
                onClick={() => fieldTransforms.unbind(node.id, field.id)}
              >
                <Trash2Icon className="size-3" />
              </button>
            </div>
            <FieldControl
              definition={fieldDefinition}
              index={index}
              label="默认值"
              value={binding.defaultValue}
              onChange={(value) => updateDefault(field.id, value)}
              onClear={() => updateDefault(field.id)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <Input
          className="h-8 text-xs"
          value={fieldName}
          placeholder="字段名称"
          onChange={(event) => setFieldName(event.target.value)}
        />
        <Select
          value={fieldType}
          onValueChange={(value) => setFieldType(value as FieldType)}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fieldTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {fieldTypeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldType === 'from-supertag' && (
          <Select value={sourceSupertagId} onValueChange={setSourceSupertagId}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="未选择" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_VALUE}>未选择</SelectItem>
              {supertags.map((supertag) => (
                <SelectItem key={supertag.id} value={supertag.id}>
                  #{supertag.text || supertag.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          className="w-full"
          disabled={!fieldName.trim()}
          size="sm"
          variant="outline"
          onClick={createAndBindField}
        >
          <PlusIcon />
          创建并绑定字段
        </Button>
      </div>
    </section>
  );
}

function createDefinition(
  type: FieldType,
  sourceSupertagId: string | undefined
): FieldDefinition {
  if (type === 'options') return { options: [], type };
  if (type === 'from-supertag') {
    return {
      sourceSupertagId:
        sourceSupertagId && sourceSupertagId !== EMPTY_VALUE
          ? sourceSupertagId
          : null,
      type,
    };
  }

  return { type };
}
