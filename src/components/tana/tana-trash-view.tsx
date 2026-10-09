'use client';

import { useState } from 'react';
import { useEditorRef } from 'platejs/react';

import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { getTanaInternalReferences, type TanaIndex, type TanaNode } from '@/lib/tana';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { TanaNodeRowChrome } from './node-projection';

export function TanaTrashView({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const children = index.childrenByParent.get(node.id) ?? [];
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => void;
  } | null>(null);

  const requestConfirmation = (action: NonNullable<typeof pendingAction>) => {
    setPendingAction(action);
  };

  return (
    <section className="tana-view-surface flex min-w-0 flex-1 flex-col overflow-auto">
      <header className="tana-view-toolbar shrink-0">
        <p className="tana-page-eyebrow">系统位置</p>
        <h1 className="tana-page-title">废纸篓</h1>
      </header>
      <div className="tana-page-scroll">
        <div className="tana-page-column">
      {children.length > 0 && (
        <button
          className="tana-destructive-action mb-4 rounded-lg px-3 py-2 text-xs hover:bg-[var(--tana-error-surface)]"
          onClick={() => requestConfirmation({
            title: '清空废纸篓？',
            description: '所有回收站节点将永久删除。可使用编辑器的撤销恢复。',
            confirmLabel: '清空废纸篓',
            action: () => editor.getTransforms(TanaNodeLifecyclePlugin).node.emptyTrash(),
          })}
        >
          清空废纸篓
        </button>
      )}
      {children.length === 0 && <div className="tana-empty-state">废纸篓为空</div>}
      {children.map((id) => {
        const target = index.nodesById.get(id);
        if (!target) return null;
        const internalReferences = getTanaInternalReferences(index, id);

        return (
          <div key={id} className="tana-view-card mb-2 flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <TanaNodeRowChrome index={index} target={target} variant="trash" />
              <div className="mt-1 text-xs text-muted-foreground">
                {target.supertagIds.length > 0 && (
                  <span>超级标签：{target.supertagIds.map((tagId) => index.nodesById.get(tagId)?.text ?? tagId).join('、')}</span>
                )}
                {(index.fieldNodesByParent.get(id)?.length ?? 0) > 0 && (
                  <span className="ml-3">字段：{index.fieldNodesByParent.get(id)!.map((field) => field.fieldId).join('、')}</span>
                )}
                {internalReferences.length > 0 && (
                  <span className="ml-3" aria-label="内部引用">
                    内部引用：{internalReferences.length}（
                    {internalReferences
                      .map((reference) => index.nodesById.get(reference.sourceNodeId)?.text ?? reference.sourceNodeId)
                      .join('、')}
                    ）
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => editor.getTransforms(TanaZoomPlugin).zoom.to(id)}>
              查看
            </button>
            <button onClick={() => editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(id)}>
              恢复
            </button>
            <button
              className="tana-destructive-action rounded-lg px-2 py-1 text-xs hover:bg-[var(--tana-error-surface)]"
              onClick={() => requestConfirmation({
                title: '永久删除此节点？',
                description: '此节点及其子节点将从回收站永久删除。可使用编辑器的撤销恢复。',
                confirmLabel: '永久删除',
                action: () => editor.getTransforms(TanaNodeLifecyclePlugin).node.deletePermanently(id),
              })}
            >
              永久删除…
            </button>
            <button
              className="tana-destructive-action rounded-lg px-2 py-1 text-xs hover:bg-[var(--tana-error-surface)]"
              onClick={() => requestConfirmation({
                title: '删除此节点的块引用？',
                description: '所有块引用将被删除，节点仍保留在回收站。可使用编辑器的撤销恢复。',
                confirmLabel: '删除块引用',
                action: () => editor.getTransforms(TanaNodeLifecyclePlugin).node.hardDeleteIncludingReferences(id),
              })}
            >
              删除节点及引用…
            </button>
          </div>
        );
      })}
        </div>
      </div>
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                pendingAction?.action();
                setPendingAction(null);
              }}
            >
              {pendingAction?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
