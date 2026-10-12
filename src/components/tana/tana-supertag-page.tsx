'use client';

import * as React from 'react';
import { SettingsIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TanaSupertagPlugin } from '@/components/editor/plugins/tana-supertag-plugin';
import {
  getActiveSupertagInstances,
  isTanaNodeActive,
  resolveTanaNodeTitle,
  type NodeId,
  type TanaIndex,
  type TanaNode,
} from '@/lib/tana';

import { TanaTableView } from './tana-table-view';
import { TanaView } from './tana-view';
import { TanaNodeBullet } from './tana-node-gutter';
import { useTanaInspector } from './tana-inspector-context';

/** Navigation items are direct canonical children, never a separately persisted dashboard. */
export function getTanaSupertagPageChildren(
  index: TanaIndex,
  supertag: TanaNode
): TanaNode[] {
  return (index.childrenByParent.get(supertag.id) ?? []).flatMap((nodeId) => {
    const node = index.nodesById.get(nodeId);

    if (!node || !isTanaNodeActive(index, node.id)) return [];

    const isContentChild = node.semanticTypes.some((semantic) =>
      ['content', 'reference', 'search', 'view'].includes(semantic)
    );
    const isStructuralChild = node.semanticTypes.some((semantic) =>
      ['field', 'field-definition', 'value', 'option'].includes(semantic)
    );

    return isContentChild && !isStructuralChild ? [node] : [];
  });
}

function getChildLabel(index: TanaIndex, node: TanaNode): string {
  const fieldNode = index.fieldNodesById.get(node.id);

  return fieldNode
    ? resolveTanaNodeTitle(index, fieldNode.fieldId) || '未命名字段'
    : resolveTanaNodeTitle(index, node.id) || '未命名节点';
}

/**
 * The default Supertag page is a derived Table of active instances. Its other
 * navigation items lead to direct canonical child Nodes, where existing plugins retain
 * Field/template editing ownership.
 */
export function TanaSupertagPage({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const inspectNode = useTanaInspector();
  const [activeChildId, setActiveChildId] = React.useState<NodeId | undefined>();
  const instances = getActiveSupertagInstances(index, node.id);
  const children = getTanaSupertagPageChildren(index, node);
  const activeChild = activeChildId
    ? children.find((child) => child.id === activeChildId)
    : undefined;
  const definition = node.supertagDefinition;
  const createAndFocusInstance = () => {
    const instanceId = editor.getTransforms(TanaSupertagPlugin).supertag.createInstance(node.id);

    if (instanceId) editor.getTransforms(TanaZoomPlugin).zoom.to(instanceId);

    return instanceId;
  };

  const runShortcut = (shortcut: { label: string; targetNodeId?: NodeId; create?: boolean }) => {
    if (shortcut.create) {
      createAndFocusInstance();
      return;
    }

    if (shortcut.targetNodeId && isTanaNodeActive(index, shortcut.targetNodeId)) {
      editor.getTransforms(TanaZoomPlugin).zoom.to(shortcut.targetNodeId);
    }
  };

  const relatedNodes = (definition?.relatedContent?.searchNodeIds ?? [])
    .map((id) => index.nodesById.get(id))
    .filter(
      (related): related is TanaNode =>
        !!related &&
        isTanaNodeActive(index, related.id) &&
        (related.searchDefinition !== undefined || related.viewDefinition !== undefined)
    );
  const bannerStyle = definition?.banner
    ? definition.banner.startsWith('http') || definition.banner.startsWith('data:')
      ? { backgroundImage: `url(${definition.banner})` }
      : { backgroundColor: definition.banner }
    : undefined;

  return (
    <section className="tana-view-surface flex min-w-0 flex-1 flex-col">
      <header className="tana-view-toolbar shrink-0">
        {definition?.banner && (
          <div
            aria-hidden="true"
            className="mb-3 h-20 rounded-lg bg-cover bg-center bg-[var(--tana-accent-soft)]"
            style={bannerStyle}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="tana-view-header flex min-h-7 items-center gap-2">
            <span className="text-[var(--tana-accent)]" style={definition?.color ? { color: definition.color } : undefined}>
              <TanaNodeBullet semanticType="supertag-definition" />
            </span>
            <span>{definition?.icon || node.text || '未命名超级标签'}</span>
          </h1>
          {inspectNode && (
            <button
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--tana-divider)] px-3 text-[var(--tana-text-secondary)] text-xs hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tana-accent)]"
              type="button"
              onClick={() => inspectNode(node.id)}
            >
              <SettingsIcon aria-hidden="true" className="size-3.5" />
              配置超级标签
            </button>
          )}
        </div>
        {definition?.description && (
          <p className="mt-1 max-w-3xl text-xs text-[var(--tana-text-tertiary)]">
            {definition.description}
          </p>
        )}
        <nav aria-label="超级标签内容" className="tana-view-toolbar-controls mt-3 flex gap-1 overflow-x-auto border-b border-[var(--tana-divider)] text-[13px]">
          <button
            aria-current={!activeChild ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-2 pb-1.5 font-medium ${!activeChild ? 'border-[var(--tana-accent)] text-[var(--tana-accent)]' : 'border-transparent text-[var(--tana-text-tertiary)] hover:text-[var(--tana-text)]'}`}
            type="button"
            onClick={() => setActiveChildId(undefined)}
          >
            全部实例
            <span className="ml-1 text-[var(--tana-text-tertiary)] text-[11px]">{instances.length}</span>
          </button>
          {children.map((child) => (
            <button
              key={child.id}
              aria-current={activeChild?.id === child.id ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-2 pb-1.5 ${activeChild?.id === child.id ? 'border-[var(--tana-accent)] text-[var(--tana-accent)]' : 'border-transparent text-[var(--tana-text-tertiary)] hover:text-[var(--tana-text)]'}`}
              type="button"
              onClick={() => {
                if (child.searchDefinition || child.viewDefinition) setActiveChildId(child.id);
                else editor.getTransforms(TanaZoomPlugin).zoom.to(child.id);
              }}
            >
              {getChildLabel(index, child)}
            </button>
          ))}
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-8 items-center rounded-lg bg-[var(--tana-accent)] px-3 font-medium text-white text-xs shadow-sm hover:brightness-95"
            type="button"
            onClick={createAndFocusInstance}
          >
            新建实例
          </button>
          {definition?.shortcuts?.map((shortcut, shortcutIndex) => {
            const disabled = !shortcut.create && (!shortcut.targetNodeId || !isTanaNodeActive(index, shortcut.targetNodeId));

            return (
              <button
                key={`${shortcut.label}-${shortcutIndex}`}
                className="inline-flex min-h-8 items-center rounded-lg border border-[var(--tana-divider)] px-3 text-xs text-[var(--tana-text-secondary)] hover:bg-[var(--tana-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                type="button"
                onClick={() => runShortcut(shortcut)}
              >
                {shortcut.label}
              </button>
            );
          })}
        </div>
      </header>
      <div className={`tana-view-content min-h-0 flex-1 overflow-y-auto ${relatedNodes.length > 0 && definition?.relatedContent?.placement === 'right' ? 'grid grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] gap-4' : ''}`}>
        <div className="min-w-0">
          {activeChild ? (
            <TanaView index={index} view={activeChild} />
          ) : instances.length === 0 ? (
            <div className="tana-empty-state text-xs">暂无超级标签实例。</div>
          ) : (
            <TanaTableView
              index={index}
              onCreateRow={createAndFocusInstance}
              results={instances}
              view={node}
            />
          )}
        </div>
        {relatedNodes.length > 0 && (
          <aside className={definition?.relatedContent?.placement === 'right' ? 'min-w-0 border-l border-[var(--tana-divider)] pl-4' : 'mt-6 border-t border-[var(--tana-divider)] pt-4'}>
            <h2 className="mb-2 text-xs font-medium text-[var(--tana-text-secondary)]">关联内容</h2>
            <div className="min-w-0 space-y-4">
              {relatedNodes.map((related) => (
                <TanaView key={related.id} index={index} view={related} />
              ))}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
