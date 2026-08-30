'use client';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';

import { BlockSelection } from '@/components/ui/block-selection';
import { isTanaNodeInteractable } from '@/lib/tana';

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
      isSelectable: (_, path) =>
        isTanaNodeInteractable(
          editor.children,
          path,
          editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS
        ),
    },
    render: {
      belowRootNodes: (props) => {
        if (!hasSelectableClass(props)) return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })),
];
