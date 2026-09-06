'use client';

import React from 'react';

import type { TListElement } from 'platejs';

import { isOrderedList } from '@platejs/list';
import {
  type PlateElementProps,
  type RenderNodeWrapper,
  useEditorRef,
  useReadOnly,
} from 'platejs/react';

import { TanaNodeIdentityPlugin } from '@/components/editor/plugins/tana-node-identity-plugin';
import { Checkbox } from '@/components/ui/checkbox';
import type { TanaBlockElement } from '@/lib/tana/types';
import { cn } from '@/lib/utils';

const config: Record<
  string,
  {
    Li: React.FC<PlateElementProps & { lineBreakBadge?: React.ReactNode }>;
    Marker: React.FC<PlateElementProps>;
  }
> = {
  todo: {
    Li: TodoLi,
    Marker: TodoMarker,
  },
};

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;
  if (
    props.element.listStyleType === 'todo' &&
    (props.element as TanaBlockElement).tanaDoneState === undefined
  ) return;
  if (!isOrderedList(props.element)) return;

  return (props) => <List {...props} />;
};

function List(props: PlateElementProps & { lineBreakBadge?: React.ReactNode }) {
  const { listStart, listStyleType } = props.element as TListElement;
  const { Li, Marker } = config[listStyleType] ?? {};
  const List = isOrderedList(props.element) ? 'ol' : 'ul';

  return (
    <List
      className="relative m-0 p-0"
      style={{ listStyleType }}
      start={listStart}
    >
      {Marker && <Marker {...props} />}
      {Li ? (
        <Li {...props} />
      ) : (
        <li>
          {props.children}
          {props.lineBreakBadge}
        </li>
      )}
    </List>
  );
}

function TodoMarker(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const node = props.element as TanaBlockElement;

  return (
    <div contentEditable={false}>
      <Checkbox
        className={cn(
          '-left-6 absolute top-1',
          readOnly && 'pointer-events-none'
        )}
        checked={node.tanaDoneState === 'done'}
        onCheckedChange={() => {
          if (readOnly || typeof node.id !== 'string') return;
          editor.getTransforms(TanaNodeIdentityPlugin).tanaNodeIdentity.toggleDone(node.id);
        }}
        onMouseDown={(event) => event.preventDefault()}
      />
    </div>
  );
}

function TodoLi(
  props: PlateElementProps & { lineBreakBadge?: React.ReactNode }
) {
  return (
    <li
      className={cn(
        'list-none',
        (props.element as TanaBlockElement).tanaDoneState === 'done' &&
          'text-muted-foreground line-through'
      )}
    >
      {props.children}
      {props.lineBreakBadge}
    </li>
  );
}
