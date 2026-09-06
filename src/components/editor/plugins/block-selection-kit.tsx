'use client';

import {
  BlockSelectionPlugin,
} from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { BlockSelection } from '@/components/ui/block-selection';
import {
  canDuplicate,
  canSelect,
  isTanaNodeInteractable,
  getTanaNodeDescendantPaths,
} from '@/lib/tana';
import { canMutateTanaNode } from '../mutation-policy';
import { indentTanaSelection, getTanaSelectedRootPaths } from './tana-node-identity-plugin';
import { TanaZoomPlugin } from './tana-zoom-plugin';

const EMPTY_OPEN_IDS = new Set<string>();

export const hasSelectableClass = ({
  attributes,
  className,
}: {
  attributes: { className?: string };
  className?: string;
}) =>
  [className, attributes.className]
    .filter(Boolean)
    .join(' ')
    .includes('slate-selectable');

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      enableContextMenu: true,
      isSelectable: (element, path) =>
        isTanaNodeInteractable(
          editor.children,
          path,
          editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS,
          editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null
        ) && canSelect(element, { document: editor.children, path }),
    },
    render: {
      belowRootNodes: (props) => {
        if (!hasSelectableClass(props)) return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })).extendEditorTransforms(({ editor }) => ({
    blockSelection: {
      duplicate: () => {
        const roots = getTanaSelectedRootPaths(editor);
        if (roots.some(path => !canMutateTanaNode(editor, path, canDuplicate))) return;
        const duplicateIds = new Set<string>();
        editor.tf.withNewBatch(() => editor.tf.withoutNormalizing(() => {
          for (const root of roots.toReversed()) {
            const paths = [root, ...getTanaNodeDescendantPaths(editor.children, root)];
            const nodes = paths.map(path => editor.api.node(path)!);
            editor.tf.duplicateNodes({ nodes });
            const inserted = editor.children[paths.at(-1)![0] + 1];
            if (typeof inserted?.id === 'string') duplicateIds.add(inserted.id);
          }
        }));
        editor.setOption(BlockSelectionPlugin, 'selectedIds', duplicateIds);
      },
      setIndent: (indent) => {
        indentTanaSelection(editor, indent);
      },
    },
  })),
];
