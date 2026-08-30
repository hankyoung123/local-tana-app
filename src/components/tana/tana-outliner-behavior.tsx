'use client';

import * as React from 'react';

import type { Path } from 'platejs';
import { KEYS } from 'platejs';
import { TogglePlugin } from '@platejs/toggle/react';
import {
  type PlateEditor,
  useEditorRef,
  useEditorSelector,
} from 'platejs/react';

import { getOrdinaryTanaParentPaths } from '@/lib/tana/outliner';

/** Promotes new ordinary parents and opens them with Plate's Toggle API. */
export function promoteTanaParentsToToggles(
  editor: PlateEditor,
  parentPaths: Path[]
) {
  const parentIds = parentPaths.flatMap((path) => {
    const id = path.length === 1 ? editor.children[path[0]]?.id : undefined;

    return typeof id === 'string' ? [id] : [];
  });

  editor.tf.withoutNormalizing(() => {
    parentPaths.forEach((path) => {
      editor.tf.setNodes({ type: KEYS.toggle }, { at: path });
    });
  });

  editor.getApi(TogglePlugin).toggle.toggleIds(parentIds, true);
}

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

    promoteTanaParentsToToggles(editor, parentPaths);
  }, [editor, parentPaths, parentPathsKey]);

  return null;
}
