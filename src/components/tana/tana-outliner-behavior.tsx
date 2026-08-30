'use client';

import * as React from 'react';

import { KEYS } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { getOrdinaryTanaParentPaths } from '@/lib/tana/outliner';

/** Promotes ordinary parents to Plate Toggle blocks; Plate owns collapse state. */
export function TanaOutlinerBehavior() {
  const editor = useEditorRef();
  const parentPaths = useEditorSelector(
    (currentEditor) => getOrdinaryTanaParentPaths(currentEditor.children),
    [],
    {
      equalityFn: (previous, next) =>
        previous.length === next.length &&
        previous.every((path, index) => path[0] === next[index]?.[0]),
    }
  );
  const parentPathsKey = parentPaths.map(([index]) => index).join(',');

  React.useEffect(() => {
    if (parentPaths.length === 0) return;

    editor.tf.withoutNormalizing(() => {
      parentPaths.forEach((path) => {
        editor.tf.setNodes({ type: KEYS.toggle }, { at: path });
      });
    });
  }, [editor, parentPaths, parentPathsKey]);

  return null;
}
