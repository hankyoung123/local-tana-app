'use client';

import * as React from 'react';

import type { Path } from 'platejs';
import type { PlateEditor } from 'platejs/react';

import { ListFilterIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import type {
  FieldDefinition,
  FieldValue,
  TanaBlockElement,
  TanaIndex,
  TanaQueryClause,
} from '@/lib/tana';
import { describeTanaQueryClause, getFieldValueCandidates } from '@/lib/tana';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ClauseKind = TanaQueryClause['kind'];

export function TanaViewDefinitionEditor({
  editor,
  index,
  node,
  path,
}: {
  editor: PlateEditor;
  index: TanaIndex;
  node: TanaBlockElement;
  path: Path;
}) {
  const [kind, setKind] = React.useState<ClauseKind>('has-supertag');
  const [fieldId, setFieldId] = React.useState('');
  const [rawValue, setRawValue] = React.useState('');
  const [supertagId, setSupertagId] = React.useState('');
  const [text, setText] = React.useState('');
  const definition = node.tanaViewDefinition;
  const supertags = Array.from(index.nodesById.values()).filter(
    ({ supertagDefinition }) => !!supertagDefinition
  );
  const fields = new Map(
    Array.from(index.nodesById.values())
      .filter((tanaNode) => !!tanaNode.fieldDefinition)
      .map((tanaNode) => [tanaNode.id, tanaNode])
  );
  const selectedField = fields.get(fieldId);

  if (!definition) {
    return (
      <div className="border-t p-5">
        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={() =>
            editor.tf.setNodes(
              { tanaViewDefinition: { clauses: [] } },
              { at: path }
            )
          }
        >
          <ListFilterIcon />
          定义为视图
        </Button>
      </div>
    );
  }

  const updateClauses = (clauses: readonly TanaQueryClause[]) => {
    editor.tf.setNodes({ tanaViewDefinition: { clauses } }, { at: path });
  };

  const addClause = () => {
    let clause: TanaQueryClause | undefined;

    if (kind === 'has-supertag' && supertagId) {
      clause = { kind, supertagId };
    } else if (kind === 'field-exists' && fieldId) {
      clause = { fieldId, kind };
    } else if (kind === 'text-contains' && text.trim()) {
      clause = { kind, text: text.trim() };
    } else if (kind === 'field-equals' && selectedField) {
      const value = getFieldValue(selectedField.fieldDefinition!, rawValue);

      if (value) clause = { fieldId: selectedField.id, kind, value };
    }

    if (!clause) return;

    updateClauses([...definition.clauses, clause]);
    setRawValue('');
    setText('');
  };

  return (
    <section className="border-t p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          <ListFilterIcon className="size-3.5" />
          视图定义
        </h3>
        <button
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
          aria-label="移除视图定义"
          onClick={() => editor.tf.unsetNodes('tanaViewDefinition', { at: path })}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      <div className="mb-3 space-y-1">
        {definition.clauses.map((clause, indexInList) => (
          <div
            key={`${clause.kind}:${indexInList}`}
            className="flex items-start gap-2 rounded bg-white px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1">
              {describeTanaQueryClause(index, clause)}
            </span>
            <button
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              type="button"
              aria-label={`移除筛选条件 ${indexInList + 1}`}
              onClick={() =>
                updateClauses(
                  definition.clauses.filter((_, index) => index !== indexInList)
                )
              }
            >
              <Trash2Icon className="size-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Select value={kind} onValueChange={(value) => setKind(value as ClauseKind)}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="has-supertag">包含超级标签</SelectItem>
            <SelectItem value="field-equals">字段等于</SelectItem>
            <SelectItem value="field-exists">字段已设置</SelectItem>
            <SelectItem value="text-contains">文本包含</SelectItem>
          </SelectContent>
        </Select>

        {kind === 'has-supertag' && (
          <Select value={supertagId} onValueChange={setSupertagId}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="选择超级标签" />
            </SelectTrigger>
            <SelectContent>
              {supertags.map((supertag) => (
                <SelectItem key={supertag.id} value={supertag.id}>
                  #{supertag.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(kind === 'field-equals' || kind === 'field-exists') && (
          <Select value={fieldId} onValueChange={setFieldId}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="选择字段" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(fields.values()).map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {field.text || field.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {kind === 'field-equals' && selectedField && (
          <QueryValueInput
            field={selectedField.fieldDefinition!}
            index={index}
            value={rawValue}
            onChange={setRawValue}
          />
        )}

        {kind === 'text-contains' && (
          <Input
            className="h-8 text-xs"
            value={text}
            placeholder="要查找的文本"
            onChange={(event) => setText(event.target.value)}
          />
        )}

        <Button
          className="w-full"
          size="sm"
          variant="outline"
          onClick={addClause}
        >
          <PlusIcon />
          添加筛选条件
        </Button>
      </div>
    </section>
  );
}

function QueryValueInput({
  field,
  index,
  onChange,
  value,
}: {
  field: FieldDefinition;
  index: TanaIndex;
  onChange: (value: string) => void;
  value: string;
}) {
  if (
    field.type === 'checkbox' ||
    field.type === 'options' ||
    field.type === 'from-supertag'
  ) {
    const options =
      field.type === 'checkbox'
        ? [
            { label: '是', value: 'true' },
            { label: '否', value: 'false' },
          ]
        : getFieldValueCandidates(index, field).map((node) => ({
            label: node.text || node.id,
            value: node.id,
          }));

    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder="选择值" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      className="h-8 text-xs"
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value}
      placeholder="值"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function getFieldValue(
  field: FieldDefinition,
  rawValue: string
): FieldValue | undefined {
  if (!rawValue) return;

  switch (field.type) {
    case 'checkbox':
      return { type: 'checkbox', value: rawValue === 'true' };
    case 'date':
      return { type: 'date', value: rawValue };
    case 'from-supertag':
      return { type: 'from-supertag', value: rawValue };
    case 'number': {
      const value = Number(rawValue);

      return Number.isNaN(value) ? undefined : { type: 'number', value };
    }
    case 'options':
      return { type: 'options', value: rawValue };
    case 'plain':
      return { type: 'plain', value: rawValue };
  }
}
