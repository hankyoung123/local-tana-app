'use client';

import * as React from 'react';
import {
  CalendarIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CornerDownRightIcon,
  HashIcon,
  ListTreeIcon,
  ListIcon,
  LinkIcon,
  MailIcon,
  PanelsTopLeftIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SquareCheckBigIcon,
  TextCursorInputIcon,
} from 'lucide-react';

import type { FieldType, TanaNodeSemanticType } from '@/lib/tana';
import { cn } from '@/lib/utils';

const semanticLabels: Record<TanaNodeSemanticType, string> = {
  content: '节点',
  'field-definition': '字段定义',
  field: '字段',
  option: '选项',
  reference: '引用',
  search: '搜索',
  'supertag-definition': '超级标签',
  value: '字段值',
  view: '视图',
};

export type TanaNodeChromeProps = {
  dragHandle?: React.ReactNode;
  dragHandleRef?: React.Ref<HTMLButtonElement>;
  fieldType?: FieldType;
  hasChildren: boolean;
  isDraggable: boolean;
  isFocusedNode?: boolean;
  isSelectionAreaVisible?: boolean;
  nodeLabel: string;
  onCollapse: () => void;
  onZoom: () => void;
  open: boolean;
  semanticType: TanaNodeSemanticType;
  showChrome?: boolean;
};

/** Presentation-only props passed from the DnD wrapper into the Plate element. */
export const TanaNodeChromeContext = React.createContext<TanaNodeChromeProps | null>(
  null
);

export function TanaNodeChrome() {
  const props = React.useContext(TanaNodeChromeContext);

  return props && props.showChrome !== false ? <TanaNodeGutter {...props} /> : null;
}

/**
 * Shared semantic marker for canonical rows and derived projections. It has no
 * state and does not own navigation; its containing button supplies that.
 */
export function TanaNodeBullet({
  compact = false,
  fieldType,
  hasChildren = false,
  semanticType,
}: {
  compact?: boolean;
  fieldType?: FieldType;
  hasChildren?: boolean;
  semanticType: TanaNodeSemanticType;
}) {
  const size = semanticType === 'content' && !compact ? 'size-[9px]' : compact ? 'size-3' : 'size-3.5';
  const iconClassName = cn(size, 'shrink-0');

  if (
    fieldType &&
    (semanticType === 'field' ||
      semanticType === 'field-definition' ||
      semanticType === 'value')
  ) {
    switch (fieldType) {
      case 'checkbox':
        return <SquareCheckBigIcon aria-hidden="true" className={iconClassName} />;
      case 'date':
        return <CalendarIcon aria-hidden="true" className={iconClassName} />;
      case 'number':
        return <HashIcon aria-hidden="true" className={iconClassName} />;
      case 'options':
      case 'from-supertag':
        return <ListIcon aria-hidden="true" className={iconClassName} />;
      case 'email':
        return <MailIcon aria-hidden="true" className={iconClassName} />;
      case 'url':
        return <LinkIcon aria-hidden="true" className={iconClassName} />;
      case 'plain':
        return <TextCursorInputIcon aria-hidden="true" className={iconClassName} />;
    }
  }

  switch (semanticType) {
    case 'content':
      return hasChildren ? (
        <CircleDotIcon aria-hidden="true" className={iconClassName} />
      ) : (
        <CircleIcon aria-hidden="true" className={cn(iconClassName, 'fill-current')} />
      );
    case 'reference':
      return <CircleDashedIcon aria-hidden="true" className={iconClassName} />;
    case 'search':
      return <SearchIcon aria-hidden="true" className={iconClassName} />;
    case 'supertag-definition':
      return (
        <span aria-hidden="true" className="relative grid size-4 place-items-center">
          <CircleIcon className="absolute size-4" />
          <HashIcon className="relative size-2.5" />
        </span>
      );
    case 'view':
      return <PanelsTopLeftIcon aria-hidden="true" className={iconClassName} />;
    case 'field-definition':
      return <SlidersHorizontalIcon aria-hidden="true" className={iconClassName} />;
    case 'field':
      return <ListTreeIcon aria-hidden="true" className={iconClassName} />;
    case 'value':
      return <CornerDownRightIcon aria-hidden="true" className={iconClassName} />;
    case 'option':
      return <CircleIcon aria-hidden="true" className={cn(iconClassName, 'fill-current')} />;
  }
}

/**
 * Presentation-only shell around existing Plate controls. The caller keeps
 * ownership of Toggle, Zoom, and DnD callbacks and refs.
 */
function GutterGlyph({ children, offset = 0 }: {
  children: React.ReactNode;
  offset?: number;
}) {
  return (
    <span className="grid size-5 place-items-center leading-none" style={{ lineHeight: 0, transform: `translateY(${offset}px)` }}>
      {children}
    </span>
  );
}

export function TanaNodeGutter({
  className,
  ...props
}: TanaNodeChromeProps & {
  className?: string;
}) {
  const {
    dragHandle,
    dragHandleRef,
    fieldType,
    hasChildren,
    isDraggable,
    isFocusedNode = false,
    isSelectionAreaVisible = false,
    nodeLabel,
    onCollapse,
    onZoom,
    open,
    semanticType,
  } = props;
  const label = nodeLabel || '未命名节点';

  return (
    <span
      className={cn(
        // Three fixed hit targets keep collapse, drag, and Zoom independent.
        // The prefix is an in-flow sibling of Slate's text children. Its
        // negative inline margin preserves the existing text coordinate.
        'tana-nodeGutter',
        isSelectionAreaVisible && 'hidden',
        isFocusedNode && 'text-[var(--tana-text-tertiary)]',
        className
      )}
      contentEditable={false}
    >
      {hasChildren && (
        <button
          aria-label={open ? `折叠 ${label}` : `展开 ${label}`}
          className="col-start-1 grid size-5 place-self-center rounded text-[var(--tana-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--tana-hover)] focus-visible:opacity-100 group-hover/tanaNode:opacity-100"
          data-plate-prevent-deselect
          title={open ? '折叠节点' : '展开节点'}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCollapse();
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <GutterGlyph>
            <ChevronRightIcon
              aria-hidden="true"
              className={cn('size-3.5 transition-transform duration-100', open && 'rotate-90')}
            />
          </GutterGlyph>
        </button>
      )}

      {isDraggable && (
        <button
          aria-label="拖动节点"
          className="col-start-2 grid size-5 place-self-center rounded text-[var(--tana-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--tana-hover)] hover:text-[var(--tana-text)] focus-visible:opacity-100 group-hover/tanaNode:opacity-100"
          data-plate-prevent-deselect
          ref={dragHandleRef}
          title="拖动节点"
          type="button"
        >
          <GutterGlyph offset={-2}>{dragHandle}</GutterGlyph>
        </button>
      )}

      <button
        aria-label={`聚焦 ${semanticLabels[semanticType]}：${label}`}
        className="col-start-3 grid size-5 place-self-center rounded text-[var(--tana-node-bullet)] transition-colors hover:bg-[var(--tana-hover)] hover:text-[var(--tana-accent)] focus-visible:bg-[var(--tana-hover)] focus-visible:text-[var(--tana-accent)]"
        data-plate-prevent-deselect
        title="聚焦节点"
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onZoom();
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <GutterGlyph offset={2}>
          <TanaNodeBullet
            compact={isFocusedNode}
            fieldType={fieldType}
            hasChildren={hasChildren}
            semanticType={semanticType}
          />
        </GutterGlyph>
      </button>
    </span>
  );
}
