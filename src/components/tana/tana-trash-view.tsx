'use client';

import { useEditorRef } from 'platejs/react';

import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import type { TanaIndex, TanaNode } from '@/lib/tana';

import { TanaNodeRowChrome } from './node-projection';

export function TanaTrashView({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const children = index.childrenByParent.get(node.id) ?? [];

  return (
    <section className="flex-1 overflow-auto p-8">
      <h1 className="mb-4 text-xl font-semibold">废纸篓</h1>
      {children.length === 0 && <p>废纸篓为空</p>}
      {children.map((id) => {
        const target = index.nodesById.get(id);
        if (!target) return null;

        return (
          <div key={id} className="flex items-center gap-4 border-b py-3">
            <div className="min-w-0 flex-1">
              <TanaNodeRowChrome index={index} target={target} variant="trash" />
            </div>
            <button onClick={() => editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(id)}>
              恢复
            </button>
            <button
              className="text-destructive"
              onClick={() => {
                if (window.confirm('永久删除此节点及其子节点？此操作无法撤销。')) {
                  editor.getTransforms(TanaNodeLifecyclePlugin).node.deletePermanently(id);
                }
              }}
            >
              永久删除…
            </button>
          </div>
        );
      })}
    </section>
  );
}
