'use client';

import { Link2Icon } from 'lucide-react';
import type { PlateEditor } from 'platejs/react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import {
  isTanaNodeActive,
  getTanaProjectionTarget,
  resolveTanaNodeTitle,
  type NodeId,
  type ReferenceRelation,
  type TanaIndex,
} from '@/lib/tana';

import { TanaNodeBullet } from './tana-node-gutter';

type ReferenceGroup = {
  kind: ReferenceRelation['kind'];
  label: string;
  relations: readonly ReferenceRelation[];
};

export function getReferenceBreadcrumb(index: TanaIndex, nodeId: NodeId): string {
  const labels: string[] = [];
  const visited = new Set<NodeId>();
  let parentId = index.parentNodeIds.get(nodeId);

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = index.nodesById.get(parentId);

    if (!parent) break;
    if (parent.systemNode !== 'workspace') {
      labels.unshift(resolveTanaNodeTitle(index, parent.id) || '未命名节点');
    }
    parentId = index.parentNodeIds.get(parentId);
  }

  return ['工作区', ...labels].join(' / ');
}

/** Relation grouping is derived from TanaIndex and preserves document order. */
export function getTanaReferenceGroups(
  index: TanaIndex,
  nodeId: NodeId
): readonly ReferenceGroup[] {
  const activeRelations = (index.backlinks.get(nodeId) ?? []).filter((relation) =>
    isTanaNodeActive(index, relation.sourceNodeId)
  );

  return [
    { kind: 'inline' as const, label: 'Mentioned in' },
    { kind: 'node' as const, label: 'Referenced in' },
  ].flatMap(({ kind, label }) => {
    const relations = activeRelations.filter((relation) => relation.kind === kind);

    return relations.length > 0 ? [{ kind, label, relations }] : [];
  });
}

/** Block backlinks borrow the target title; inline backlinks name their host Node. */
export function getTanaReferenceBacklinkTitle(
  index: TanaIndex,
  relation: ReferenceRelation
): string {
  const source = index.nodesById.get(relation.sourceNodeId);

  if (!source) return '已删除的节点';

  const owner = relation.kind === 'node'
    ? getTanaProjectionTarget(index, source.id)
    : source;

  return owner ? resolveTanaNodeTitle(index, owner.id) || '未命名节点' : '目标已删除';
}

/** Inline backlinks select the exact mention occurrence after revealing its host. */
export function navigateTanaReferenceRelation(
  editor: PlateEditor,
  relation: ReferenceRelation
): boolean {
  if (!editor.getTransforms(TanaZoomPlugin).zoom.to(relation.sourceNodeId)) return false;

  if (relation.kind === 'inline') {
    const point = editor.api.start(relation.path);
    if (!point) return false;
    editor.tf.select(point);
    editor.tf.focus();
  }

  return true;
}

/** A derived navigation surface; backlink relations remain owned by TanaIndex. */
export function TanaReferencesSection({
  index,
  nodeId,
}: {
  index: TanaIndex;
  nodeId: NodeId;
}) {
  const editor = useEditorRef();
  const groups = getTanaReferenceGroups(index, nodeId);
  const referenceCount = groups.reduce((count, group) => count + group.relations.length, 0);

  if (referenceCount === 0) return null;

  return (
    <section aria-label="引用此节点" className="mt-8 border-t border-[var(--tana-divider)] pt-5">
      <h2 className="mb-3 flex items-center gap-2 font-medium text-sm text-[var(--tana-text-secondary)]">
        <Link2Icon aria-hidden="true" className="size-4 text-[var(--tana-reference)]" />
        {referenceCount} References
      </h2>

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.kind} aria-label={group.label}>
            <h3 className="mb-1 px-1.5 font-medium text-[10px] text-[var(--tana-text-tertiary)] uppercase tracking-[0.1em]">
              {group.label}
            </h3>
            <div className="space-y-0.5">
              {group.relations.map((relation, position) => {
                const source = index.nodesById.get(relation.sourceNodeId);
                const title = getTanaReferenceBacklinkTitle(index, relation);

                return (
                  <button
                    key={`${relation.kind}-${relation.sourceNodeId}-${relation.path.join('.')}-${position}`}
                    className="flex min-h-8 w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[13px] leading-5 text-[var(--tana-text-secondary)] transition-colors hover:bg-[var(--tana-hover)]"
                    type="button"
                    onClick={() => navigateTanaReferenceRelation(editor, relation)}
                  >
                    <span className="grid size-6 shrink-0 place-items-center text-[var(--tana-node-bullet)]">
                      <TanaNodeBullet semanticType={source?.semanticType ?? 'content'} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--tana-text)]">
                        {title || '未命名节点'}
                      </span>
                      <span className="block truncate text-[11px] leading-4 text-[var(--tana-text-tertiary)]">
                        {getReferenceBreadcrumb(index, relation.sourceNodeId)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
