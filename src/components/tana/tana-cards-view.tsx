'use client';

import * as React from 'react';
import { GroupIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';
import type { PlateEditor } from 'platejs/react';

import { TanaFieldPlugin } from '@/components/editor/plugins/tana-field-plugin';
import { TanaViewPlugin } from '@/components/editor/plugins/tana-view-plugin';
import {
  resolveTanaViewProjection,
  type TanaIndex,
  type NodeId,
  type FieldValue,
  type TanaNode,
  type TanaViewProjection,
} from '@/lib/tana';

import { NodeProjection } from './node-projection';
import { createTanaViewNode } from './tana-view-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TanaViewDisplayFieldsControl } from './tana-view-display-fields-control';

/** A Cards drop is valid only for a concrete target Field Value. */
export function applyTanaCardsGroupDrop(
  editor: PlateEditor,
  occurrenceId: NodeId,
  fieldId: NodeId,
  value: FieldValue | undefined
): boolean {
  if (!value) return false;

  const fields = editor.getTransforms(TanaFieldPlugin).field;
  const write = () => {
    if (!fields.materialize(occurrenceId, fieldId)) return false;
    return fields.setValue(occurrenceId, fieldId, value);
  };

  if (editor.api.isMerging()) return write();

  let result = false;
  editor.tf.withNewBatch(() => {
    result = write();
  });
  return result;
}

/** Cards are grouped canonical Node projections; a group has no stored Card entity. */
export function TanaCardsView({
  index,
  projection,
  results,
  view,
}: {
  index: TanaIndex;
  projection?: TanaViewProjection;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const resolved = projection ?? resolveTanaViewProjection(index, view, results);
  const groupFieldId = view.viewDefinition?.type === 'cards'
    ? view.viewDefinition.groupFieldId
    : undefined;
  const grouped = Boolean(groupFieldId);

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {resolved.groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {grouped && (
            <h2 className="px-1 text-xs font-medium text-[var(--tana-text-tertiary)]">
              {group.label} · {group.items.length}
            </h2>
          )}
          <div
            className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            onDragOver={(event) => {
              if (groupFieldId && group.fieldValue) event.preventDefault();
            }}
            onDrop={(event) => {
              const occurrenceId = event.dataTransfer.getData('application/x-tana-node-id');
              if (!groupFieldId || !group.fieldValue || !occurrenceId) return;
              event.preventDefault();
              applyTanaCardsGroupDrop(editor, occurrenceId, groupFieldId, group.fieldValue);
            }}
          >
            {group.items.map(({ occurrence }) => (
              <article
                draggable={Boolean(groupFieldId)}
                key={occurrence.id}
                className="tana-projectionCard min-w-0 overflow-hidden rounded-md border border-[var(--tana-divider)] bg-[var(--tana-canvas)] transition-colors hover:bg-[var(--tana-hover)] focus-within:ring-2 focus-within:ring-[var(--tana-accent)]"
                onDragStart={(event) =>
                  event.dataTransfer.setData('application/x-tana-node-id', occurrence.id)
                }
              >
                <NodeProjection
                  fieldIds={resolved.visibleFieldIds}
                  index={index}
                  targetNodeId={occurrence.id}
                  variant="search-result"
                />
              </article>
            ))}
          </div>
        </section>
      ))}
      <button
        className="rounded px-2 py-1 text-xs text-[var(--tana-link)] hover:bg-[var(--tana-hover)]"
        type="button"
        onClick={() => createTanaViewNode(editor, view.id)}
      >
        添加卡片
      </button>
    </div>
  );
}

export function TanaCardsToolbarControls({
  index,
  results,
  view,
}: {
  index: TanaIndex;
  results: readonly TanaNode[];
  view: TanaNode;
}) {
  const editor = useEditorRef();
  const resolved = resolveTanaViewProjection(index, view, results);
  const groupFieldId = view.viewDefinition?.groupFieldId;
  const { availableFieldIds: fieldIds } = resolved;

  return (
    <>
    <TanaViewDisplayFieldsControl index={index} label="选择卡片显示字段" results={results} view={view} />
    <Select value={groupFieldId ?? '__none__'} onValueChange={(value) => editor.getTransforms(TanaViewPlugin).view.update(view.id, { groupFieldId: value === '__none__' ? undefined : value })}>
      <SelectTrigger aria-label="按字段分组卡片" className="h-7 w-24 border-0 bg-transparent px-2 text-xs shadow-none"><GroupIcon className="size-3.5"/><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="__none__">不分组</SelectItem>{fieldIds.map((fieldId) => <SelectItem key={fieldId} value={fieldId}>按{index.nodesById.get(fieldId)?.text || '字段'}</SelectItem>)}</SelectContent>
    </Select>
    </>
  );
}
