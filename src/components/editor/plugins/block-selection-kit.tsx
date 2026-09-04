'use client';

import {
  BlockSelectionPlugin,
  duplicateBlockSelectionNodes,
  setBlockSelectionIndent,
} from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { BlockSelection } from '@/components/ui/block-selection';
import {
  canDuplicate,
  canIndent,
  canOutdent,
  canSelect,
  isTanaNodeInteractable,
} from '@/lib/tana';
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
        const selected = editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes({ sort: true });

        if (
          selected.some(([node, path]) =>
            !canDuplicate(node, { document: editor.children, path })
          )
        ) {
          return;
        }

        duplicateBlockSelectionNodes(editor);
      },
      setIndent: (indent, options) => {
        const selected = editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes({ sort: true });
        const canChangeIndent = indent < 0 ? canOutdent : canIndent;

        if (
          selected.some(([node, path]) =>
            !canChangeIndent(node, { document: editor.children, path })
          )
        ) {
          return;
        }

        setBlockSelectionIndent(editor, indent, options);
      },
    },
  })),
];
