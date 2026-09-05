'use client';
import { useEditorRef } from 'platejs/react';
import { TanaNodeLifecyclePlugin } from '@/components/editor/plugins/tana-node-lifecycle-plugin';
import type { TanaIndex, TanaNode } from '@/lib/tana';

export function TanaTrashView({ index, node }: { index: TanaIndex; node: TanaNode }) {
  const editor = useEditorRef();
  const children = index.childrenByParent.get(node.id) ?? [];
  return <section className="flex-1 overflow-auto p-8">
    <h1 className="mb-4 text-xl font-semibold">废纸篓</h1>
    {children.length === 0 && <p>废纸篓为空</p>}
    {children.map((id) => <div key={id} className="flex items-center gap-4 border-b py-3">
      <span className="flex-1">{index.nodesById.get(id)?.text || '未命名节点'}</span>
      <button onClick={() => editor.getTransforms(TanaNodeLifecyclePlugin).node.restore(id)}>恢复</button>
      <button className="text-destructive" onClick={() => {
        if (window.confirm('永久删除此节点及其子节点？此操作无法撤销。'))
          editor.getTransforms(TanaNodeLifecyclePlugin).node.deletePermanently(id);
      }}>永久删除…</button>
    </div>)}
  </section>;
}
