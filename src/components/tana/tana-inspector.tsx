'use client';

import * as React from 'react';

import type { Path } from 'platejs';
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
  NodeId,
  TanaBlockElement,
  TanaIndex,
} from '@/lib/tana';
import { getNodeSupertagIds, TANA_SUPERTAG_KEY } from '@/lib/tana';
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

import { TanaViewDefinitionEditor } from './tana-view-editor';

const EMPTY_VALUE = '__local_tana_empty__';

type TanaInspectorProps = {
  editor: PlateEditor;
  index: TanaIndex;
  onNavigate: (nodeId: NodeId) => void;
  selectedNodeId: NodeId | null;
};

export function TanaInspector({
  editor,
  index,
  onNavigate,
  selectedNodeId,
}: TanaInspectorProps) {
  const selectedNode = selectedNodeId
    ? index.nodesById.get(selectedNodeId)
    : undefined;

  if (!selectedNode) {
    return (
      <aside className="hidden h-full w-72 shrink-0 border-l bg-[#fafbfa] p-5 xl:block">
        <p className="text-muted-foreground text-xs">
          Select a node to inspect its Tana semantics.
        </p>
      </aside>
    );
  }

  const supertagIds = getNodeSupertagIds(index, selectedNode.id);
  const fieldDefinitions = supertagIds.flatMap((supertagId) => {
    const definition = index.nodesById.get(supertagId)?.supertagDefinition;

    return (definition?.fields ?? []).map((field) => ({ field, supertagId }));
  });
  const backlinks = index.backlinks.get(selectedNode.id) ?? [];

  const updateSelectedNode = (props: Partial<TanaBlockElement>) => {
    editor.tf.setNodes(props, { at: selectedNode.path });
  };

  const updateFieldValue = (
    field: FieldDefinition,
    fieldValue?: FieldValue
  ) => {
    const nextValues = { ...(selectedNode.fieldValues ?? {}) };

    if (fieldValue) {
      nextValues[field.id] = fieldValue;
    } else {
      delete nextValues[field.id];
    }

    if (Object.keys(nextValues).length === 0) {
      editor.tf.unsetNodes('tanaFieldValues', { at: selectedNode.path });
    } else {
      updateSelectedNode({ tanaFieldValues: nextValues });
    }
  };

  const removeSupertag = (supertagId: NodeId) => {
    const entries = Array.from(
      editor.api.nodes({
        at: selectedNode.path,
        match: (node) =>
          'type' in node &&
          node.type === TANA_SUPERTAG_KEY &&
          node.key === supertagId,
      })
    );

    entries.reverse().forEach(([, path]) => editor.tf.removeNodes({ at: path }));
  };

  return (
    <aside className="hidden h-full w-72 shrink-0 overflow-y-auto border-l bg-[#fafbfa] xl:block">
      <div className="border-b p-5">
        <p className="mb-1 text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          Inspector
        </p>
        <h2 className="truncate font-semibold text-sm">{selectedNode.text}</h2>
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {selectedNode.id}
        </p>
      </div>

      <InspectorSection icon={<HashIcon />} title="Supertags">
        {supertagIds.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Type # in the node to apply a supertag.
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
                  aria-label={`Remove ${supertagId}`}
                  onClick={() => removeSupertag(supertagId)}
                >
                  <Trash2Icon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </InspectorSection>

      <InspectorSection icon={<TagIcon />} title="Fields">
        {fieldDefinitions.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Applied supertags have no fields.
          </p>
        ) : (
          <div className="space-y-3">
            {fieldDefinitions.map(({ field, supertagId }) => (
              <FieldControl
                key={`${supertagId}:${field.id}`}
                field={field}
                index={index}
                value={selectedNode.fieldValues?.[field.id]}
                onChange={(value) => updateFieldValue(field, value)}
              />
            ))}
          </div>
        )}
      </InspectorSection>

      <InspectorSection icon={<ArrowUpRightIcon />} title="Backlinks">
        {backlinks.length === 0 ? (
          <p className="text-muted-foreground text-xs">No references yet.</p>
        ) : (
          <div className="space-y-1">
            {backlinks.map((backlink, indexInList) => {
              const sourceNode = index.nodesById.get(backlink.sourceNodeId);

              return (
                <button
                  key={`${backlink.sourceNodeId}:${indexInList}`}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  type="button"
                  onClick={() => onNavigate(backlink.sourceNodeId)}
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
        node={selectedNode.node as TanaBlockElement}
        path={selectedNode.path}
      />
      <TanaViewDefinitionEditor
        editor={editor}
        index={index}
        node={selectedNode.node as TanaBlockElement}
        path={selectedNode.path}
      />
    </aside>
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
  field,
  index,
  onChange,
  value,
}: {
  field: FieldDefinition;
  index: TanaIndex;
  onChange: (value?: FieldValue) => void;
  value?: FieldValue;
}) {
  const label = (
    <span className="mb-1.5 block font-medium text-[11px] text-muted-foreground">
      {field.name}
    </span>
  );

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-3 text-xs">
        {field.name}
        <Checkbox
          checked={value?.type === 'boolean' ? value.value : false}
          onCheckedChange={(checked) =>
            onChange({ type: 'boolean', value: checked === true })
          }
        />
      </label>
    );
  }

  if (field.type === 'select' || field.type === 'node-reference') {
    const currentValue =
      value?.type === field.type ? value.value : EMPTY_VALUE;
    const options =
      field.type === 'select'
        ? field.options.map((option) => ({ label: option, value: option }))
        : Array.from(index.nodesById.values()).map((node) => ({
            label: node.text || node.id,
            value: node.id,
          }));

    return (
      <label className="block">
        {label}
        <Select
          value={currentValue}
          onValueChange={(nextValue) => {
            if (nextValue === EMPTY_VALUE) return onChange();

            onChange({ type: field.type, value: nextValue });
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Not set" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_VALUE}>Not set</SelectItem>
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

  const currentValue = value?.type === field.type ? value.value : '';

  return (
    <label className="block">
      {label}
      <Input
        className="h-8 text-xs"
        type={field.type === 'number' ? 'number' : field.type}
        value={currentValue}
        onChange={(event) => {
          if (event.target.value === '') return onChange();

          if (field.type === 'number') {
            const numericValue = event.target.valueAsNumber;

            if (!Number.isNaN(numericValue)) {
              onChange({ type: 'number', value: numericValue });
            }
          } else {
            onChange({ type: field.type, value: event.target.value });
          }
        }}
      />
    </label>
  );
}

function SupertagDefinitionEditor({
  editor,
  node,
  path,
}: {
  editor: PlateEditor;
  node: TanaBlockElement;
  path: Path;
}) {
  const [fieldName, setFieldName] = React.useState('');
  const [fieldType, setFieldType] = React.useState<FieldType>('text');
  const [selectOptions, setSelectOptions] = React.useState('');
  const definition = node.tanaSupertagDefinition;

  if (!definition) {
    return (
      <div className="p-5">
        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={() =>
            editor.tf.setNodes(
              { tanaSupertagDefinition: { fields: [] } },
              { at: path }
            )
          }
        >
          <HashIcon />
          Define as supertag
        </Button>
      </div>
    );
  }

  const updateFields = (fields: readonly FieldDefinition[]) => {
    editor.tf.setNodes(
      { tanaSupertagDefinition: { fields } },
      { at: path }
    );
  };

  const addField = () => {
    const name = fieldName.trim();

    if (!name) return;

    const base = {
      id: `field-${crypto.randomUUID()}`,
      name,
    };
    const field: FieldDefinition =
      fieldType === 'select'
        ? {
            ...base,
            options: selectOptions
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean),
            type: 'select',
          }
        : { ...base, type: fieldType };

    updateFields([...definition.fields, field]);
    setFieldName('');
    setSelectOptions('');
  };

  return (
    <section className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          <HashIcon className="size-3.5" />
          Definition
        </h3>
        <button
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          aria-label="Remove supertag definition"
          onClick={() => editor.tf.unsetNodes('tanaSupertagDefinition', { at: path })}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      <div className="mb-3 space-y-1">
        {definition.fields.map((field) => (
          <div
            key={field.id}
            className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">{field.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {field.type}
            </span>
            <button
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              type="button"
              aria-label={`Remove field ${field.name}`}
              onClick={() =>
                updateFields(
                  definition.fields.filter(({ id }) => id !== field.id)
                )
              }
            >
              <Trash2Icon className="size-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Input
          className="h-8 text-xs"
          value={fieldName}
          placeholder="Field name"
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
            {(
              [
                'text',
                'number',
                'boolean',
                'date',
                'select',
                'node-reference',
              ] as const
            ).map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldType === 'select' && (
          <Input
            className="h-8 text-xs"
            value={selectOptions}
            placeholder="Options, comma separated"
            onChange={(event) => setSelectOptions(event.target.value)}
          />
        )}
        <Button
          className="w-full"
          disabled={!fieldName.trim()}
          size="sm"
          variant="outline"
          onClick={addField}
        >
          <PlusIcon />
          Add field
        </Button>
      </div>
    </section>
  );
}
