'use client';

import { ArrowUpRightIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
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
  getFieldValueCandidates,
  resolveTanaNodeTitle,
  type FieldValue,
  type NodeId,
  type TanaIndex,
  type TanaNode,
} from '@/lib/tana';

import { getProjectionEditableTitle, ProjectionTitleInput } from './node-projection';

function FieldCell({
  fieldId,
  index,
  nodeId,
}: {
  fieldId: NodeId;
  index: TanaIndex;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const field = (index.fieldNodesByParent.get(nodeId) ?? []).find(
    (candidate) => candidate.fieldId === fieldId
  );
  const definition = index.nodesById.get(fieldId)?.fieldDefinition;

  if (!field || !definition) return <span className="text-muted-foreground">—</span>;

  const setValue = (value: FieldValue) =>
    editor.getTransforms(TanaFieldPlugin).field.setValue(nodeId, fieldId, value);

  if (definition.type === 'checkbox') {
    const value = field.value?.type === 'checkbox' ? field.value.value : false;

    return (
      <Checkbox
        aria-label={`${index.nodesById.get(fieldId)?.text || '字段'}字段值`}
        checked={value}
        onCheckedChange={(checked) => {
          if (typeof checked === 'boolean') setValue({ type: 'checkbox', value: checked });
        }}
      />
    );
  }

  if (definition.type === 'options' || definition.type === 'from-supertag') {
    const value = field.value?.type === definition.type ? field.value.value : undefined;
    const candidates = getFieldValueCandidates(index, fieldId);

    return (
      <Select
        value={value}
        onValueChange={(candidateId) =>
          setValue({ type: definition.type, value: candidateId } as Extract<FieldValue, { type: 'options' | 'from-supertag' }>)
        }
      >
        <SelectTrigger className="h-7 min-w-28 border-0 bg-transparent px-1.5 text-xs shadow-none">
          <SelectValue placeholder="未设置" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.text || '未命名节点'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const value = field.value?.type === definition.type ? String(field.value.value) : '';

  return (
    <input
      aria-label={`${index.nodesById.get(fieldId)?.text || '字段'}字段值`}
      className="h-7 min-w-28 rounded bg-transparent px-1.5 text-xs outline-none hover:bg-muted/60 focus:bg-white focus:ring-1 focus:ring-[#8bb69b]"
      type={
        definition.type === 'number'
          ? 'number'
          : definition.type === 'date'
            ? 'date'
            : definition.type === 'email'
              ? 'email'
              : definition.type === 'url'
                ? 'url'
                : 'text'
      }
      value={value}
      onChange={(event) => {
        const raw = event.target.value;

        if (!raw) return;
        if (definition.type === 'number') {
          const number = Number(raw);
          if (Number.isFinite(number)) setValue({ type: 'number', value: number });
          return;
        }
        if (definition.type === 'date') {
          setValue({ type: 'date', value: raw });
          return;
        }
        if (definition.type === 'email') {
          setValue({ type: 'email', value: raw });
          return;
        }
        if (definition.type === 'url') {
          setValue({ type: 'url', value: raw });
          return;
        }
        setValue({ type: 'plain', value: raw });
      }}
    />
  );
}

/** A table row is a canonical Node projection, never a table-specific copy. */
function TableRow({
  fieldIds,
  index,
  node,
}: {
  fieldIds: readonly NodeId[];
  index: TanaIndex;
  node: TanaNode;
}) {
  const editor = useEditorRef();
  const displayTitle = resolveTanaNodeTitle(index, node.id);
  const editableTitle = getProjectionEditableTitle(node);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="min-w-56 px-3 py-2 align-middle">
        <div className="flex items-center gap-1.5">
          <button
            aria-label={`打开 ${displayTitle || '未命名节点'}`}
            className="shrink-0 text-muted-foreground"
            type="button"
            onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(node.id)}
          >
            <ArrowUpRightIcon className="size-3.5" />
          </button>
          <ProjectionTitleInput
            displayTitle={displayTitle}
            readOnly={node.titleExpression !== undefined}
            targetNodeId={node.id}
            title={editableTitle}
          />
        </div>
      </td>
      {fieldIds.map((fieldId) => (
        <td key={fieldId} className="min-w-32 px-3 py-2 align-middle text-xs">
          <FieldCell fieldId={fieldId} index={index} nodeId={node.id} />
        </td>
      ))}
    </tr>
  );
}

export function TanaTableView({ index, results }: { index: TanaIndex; results: readonly TanaNode[] }) {
  const fieldIds = Array.from(
    new Set(
      results.flatMap((node) => (index.fieldNodesByParent.get(node.id) ?? []).map((field) => field.fieldId))
    )
  );

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full border-collapse">
        <thead className="bg-muted/30 text-left text-muted-foreground text-xs">
          <tr>
            <th className="px-3 py-2 font-medium">节点</th>
            {fieldIds.map((fieldId) => (
              <th key={fieldId} className="px-3 py-2 font-medium">
                {index.nodesById.get(fieldId)?.text || '未命名字段'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{results.map((node) => <TableRow key={node.id} fieldIds={fieldIds} index={index} node={node} />)}</tbody>
      </table>
    </div>
  );
}
