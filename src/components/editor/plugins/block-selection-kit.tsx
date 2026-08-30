'use client';

import { BlockSelectionPlugin } from '@platejs/selection/react';

import { BlockSelection } from '@/components/ui/block-selection';
import { isTanaNodeElement } from '@/lib/tana';

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
  BlockSelectionPlugin.configure(() => ({
    options: {
      enableContextMenu: true,
      isSelectable: isTanaNodeElement,
    },
    render: {
      belowRootNodes: (props) => {
        if (!hasSelectableClass(props)) return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })),
];
