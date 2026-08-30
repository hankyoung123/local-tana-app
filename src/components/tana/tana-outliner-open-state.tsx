'use client';

import * as React from 'react';

import { TogglePlugin } from '@platejs/toggle/react';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { getTanaParentNodeIds } from '@/lib/tana/outliner';

/**
 * Gives newly-created flat-indent parents their initial expanded state.
 *
 * This is not a collapse store: Plate Toggle's `openIds` remains the only
 * state and user changes are never overwritten for an existing NodeId.
 */
export function TanaOutlinerOpenState() {
  const editor = useEditorRef();
  const initializedParentIds = React.useRef(new Set<string>());
  const parentIds = useEditorSelector(
    (currentEditor) => getTanaParentNodeIds(currentEditor.children),
    [],
    {
      equalityFn: (previous, next) =>
        previous.length === next.length &&
        previous.every((id, index) => id === next[index]),
    }
  );
  const parentIdsKey = parentIds.join(',');

  React.useEffect(() => {
    const currentParentIds = new Set(parentIds);
    const idsToOpen = parentIds.filter(
      (id) => !initializedParentIds.current.has(id)
    );

    initializedParentIds.current = currentParentIds;

    if (idsToOpen.length > 0) {
      editor.getApi(TogglePlugin).toggle.toggleIds(idsToOpen, true);
    }
  }, [editor, parentIds, parentIdsKey]);

  return null;
}
