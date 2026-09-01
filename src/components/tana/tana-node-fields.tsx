'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import {
  getFieldValueCandidates,
  getNodeFieldDescriptors,
  isFieldValueCompatible,
  type FieldValue,
  type NodeId,
  type TanaFieldDescriptor,
} from '@/lib/tana';
import { useEditorRef } from 'platejs/react';

import { useTanaIndex } from './tana-index-context';

const EMPTY_VALUE = '__local_tana_empty__';

/** Renders only the focused Node's visible semantic Field Values in its body. */
export function TanaNodeFields({ nodeId }: { nodeId: NodeId }) {
  const index = useTanaIndex();
  const descriptors = getNodeFieldDescriptors(index, nodeId).filter(
    (descriptor) => descriptor.source !== 'system' && descriptor.visible
  );

  if (descriptors.length === 0) return null;

  return (
    <div
      aria-label="节点字段"
      className="tana-nodeFields mt-3 mb-4 max-w-2xl space-y-0.5 pl-1"
      contentEditable={false}
    >
      {descriptors.map((descriptor) => (
        <NodeFieldRow key={descriptor.key} descriptor={descriptor} nodeId={nodeId} />
      ))}
    </div>
  );
}

function NodeFieldRow({
  descriptor,
  nodeId,
}: {
  descriptor: TanaFieldDescriptor;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const index = useTanaIndex();
  const fieldTransforms = editor.getTransforms(TanaFieldPlugin).field;
  const definition = descriptor.definition;
  const compatibleValue =
    descriptor.value && definition && isFieldValueCompatible(definition, descriptor.value)
      ? descriptor.value
      : undefined;

  if (!definition || !descriptor.fieldId) return null;

  const setValue = (value: FieldValue) =>
    fieldTransforms.setValue(nodeId, descriptor.fieldId!, value);
  const clearValue = () => fieldTransforms.clearValue(nodeId, descriptor.fieldId!);

  return (
    <div className="group grid min-h-8 grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded px-2 py-0.5 text-sm hover:bg-[#f7f9f8]">
      <span className="truncate text-[#7b827d]">{descriptor.label}</span>
      <NodeFieldValueInput
        definition={definition}
        index={index}
        value={compatibleValue}
        onChange={setValue}
        onClear={clearValue}
      />
      <button
        aria-label={`清除字段 ${descriptor.label}`}
        className="opacity-0 text-[11px] text-[#7b827d] transition-opacity hover:text-[#202421] focus:opacity-100 group-hover:opacity-100"
        type="button"
        onClick={clearValue}
      >
        清除
      </button>
    </div>
  );
}

function NodeFieldValueInput({
  definition,
  index,
  onChange,
  onClear,
  value,
}: {
  definition: NonNullable<TanaFieldDescriptor['definition']>;
  index: ReturnType<typeof useTanaIndex>;
  onChange: (value: FieldValue) => void;
  onClear: () => void;
  value?: FieldValue;
}) {
  if (definition.type === 'checkbox') {
    const checked = value?.type === 'checkbox' ? value.value : false;

    return (
      <label className="flex min-h-7 items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          onCheckedChange={(next) =>
            onChange({ type: 'checkbox', value: next === true })
          }
        />
        <span className={value ? 'text-[#343a36]' : 'text-[#9aa19d]'}>
          {value?.type === 'checkbox' ? (checked ? '是' : '否') : '未设置'}
        </span>
      </label>
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    const currentValue =
      value?.type === definition.type ? value.value : EMPTY_VALUE;
    const candidates = getFieldValueCandidates(index, definition);

    return (
      <Select
        value={currentValue}
        onValueChange={(next) => {
          if (next === EMPTY_VALUE) return onClear();

          onChange({ type: definition.type, value: next });
        }}
      >
        <SelectTrigger className="h-7 w-full border-0 bg-transparent px-0 text-sm shadow-none hover:bg-transparent focus:ring-0">
          <SelectValue placeholder="未设置" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>未设置</SelectItem>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.text || '未命名节点'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const currentValue = value?.type === definition.type ? value.value : '';

  return (
    <Input
      className="h-7 w-full border-0 bg-transparent px-0 text-sm shadow-none placeholder:text-[#9aa19d] focus-visible:border-0 focus-visible:ring-0"
      placeholder="未设置"
      type={
        definition.type === 'date'
          ? 'date'
          : definition.type === 'number'
            ? 'number'
            : 'text'
      }
      value={currentValue}
      onChange={(event) => {
        if (event.target.value === '') return onClear();

        if (definition.type === 'number') {
          const nextNumber = event.target.valueAsNumber;

          if (!Number.isNaN(nextNumber)) {
            onChange({ type: 'number', value: nextNumber });
          }

          return;
        }

        onChange({ type: definition.type, value: event.target.value });
      }}
    />
  );
}
