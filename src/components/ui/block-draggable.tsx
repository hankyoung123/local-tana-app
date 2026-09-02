'use client';

import * as React from 'react';

import {
  type CanDropCallback,
  DndPlugin,
  useDraggable,
  useDropLine,
} from '@platejs/dnd';
import { expandListItemsWithChildren } from '@platejs/list';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { TogglePlugin } from '@platejs/toggle/react';
import { CircleIcon, ChevronRight, GripVertical } from 'lucide-react';
import { ElementApi, type Path, type TElement, getPluginByType } from 'platejs';
import {
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
  MemoizedChildren,
  useEditorRef,
  useEditorSelector,
  useElement,
  usePluginOption,
} from 'platejs/react';
import { useSelected } from 'platejs/react';

import { Button } from '@/components/ui/button';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { useTanaIndex } from '@/components/tana/tana-index-context';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  hasTanaNodeDescendants,
  getTanaParentPath,
  isTanaNodeElement,
  isTanaNodeHidden,
  isTanaNodeInteractable,
} from '@/lib/tana';

const EMPTY_OPEN_IDS = new Set<string>();

function getTanaSemanticBlock(editor: PlateEditor, path: Path) {
  const entry = editor.api.node(path);

  return entry && ElementApi.isElement(entry[0])
    ? (entry[0] as TElement & {
        tanaFieldDefinition?: unknown;
        tanaFieldId?: unknown;
        tanaFieldValueType?: unknown;
      })
    : undefined;
}

function isFieldOccurrence(node: ReturnType<typeof getTanaSemanticBlock>) {
  return typeof node?.tanaFieldId === 'string';
}

function isFieldValueNode(node: ReturnType<typeof getTanaSemanticBlock>) {
  return typeof node?.tanaFieldValueType === 'string';
}

function isFieldHost(node: ReturnType<typeof getTanaSemanticBlock>) {
  return (
    !!node &&
    !isFieldOccurrence(node) &&
    !isFieldValueNode(node) &&
    node.tanaFieldDefinition === undefined
  );
}

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    if (editor.dom.readOnly) return false;

    return isTanaNodeElement(element, path);
  }, [editor, element, path]);

  if (!enabled) return;

  return (nodeProps) => <TanaDraggableNode {...nodeProps} tanaPath={path} />;
};

function TanaDraggableNode({
  tanaPath,
  ...props
}: PlateElementProps & { tanaPath: Path }) {
  const openIds = usePluginOption(TogglePlugin, 'openIds') ?? EMPTY_OPEN_IDS;
  const focusedNodeId =
    usePluginOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
  const { hasChildren, isInteractable } = useEditorSelector(
    (editor) => ({
      hasChildren: hasTanaNodeDescendants(editor.children, tanaPath),
      isInteractable: isTanaNodeInteractable(
        editor.children,
        tanaPath,
        openIds,
        focusedNodeId
      ),
    }),
    [focusedNodeId, openIds, tanaPath]
  );

  if (!isInteractable) {
    return <HiddenTanaNode>{props.children}</HiddenTanaNode>;
  }

  return (
    <Draggable
      {...props}
      hasChildren={hasChildren}
      isFocusedNode={
        typeof props.element.id === 'string' && props.element.id === focusedNodeId
      }
      openIds={openIds}
      tanaPath={tanaPath}
    />
  );
}

function HiddenTanaNode({ children }: Pick<PlateElementProps, 'children'>) {
  return (
    <div
      aria-hidden="true"
      className="invisible m-0 h-0 overflow-hidden"
      contentEditable={false}
    >
      <MemoizedChildren>{children}</MemoizedChildren>
    </div>
  );
}

export const canDropOnInteractableTanaNode: CanDropCallback = ({
  dragEntry,
  dragItem,
  dropEntry,
  editor,
}) => {
  const openIds = editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS;
  const focusedNodeId =
    editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
  const isInteractable = (path: Path) =>
    isTanaNodeInteractable(
      editor.children,
      path,
      openIds,
      focusedNodeId
    );

  if (!isInteractable(dropEntry[1])) return false;
  if (dragEntry && !isInteractable(dragEntry[1])) return false;

  if (!('id' in dragItem)) return true;

  const dragIds = Array.isArray(dragItem.id) ? dragItem.id : [dragItem.id];
  const dragged = dragIds.flatMap((id) => {
    const dragNode = editor.api.node({ at: [], id });

    return dragNode ? [dragNode] : [];
  });

  if (dragged.length !== dragIds.length || !dragged.every(([, path]) => isInteractable(path))) {
    return false;
  }

  const dropNode = getTanaSemanticBlock(editor, dropEntry[1]);

  // A typed value cannot be moved independently from the one Field occurrence
  // that owns it. The normal Plate multi-block drag retains the Field subtree.
  if (
    dragged.some(([node, path]) => {
      const semanticNode = node as TElement & { tanaFieldValueType?: unknown };

      if (typeof semanticNode.tanaFieldValueType !== 'string') return false;

      const ownerPath = getTanaParentPath(editor.children, path);
      const owner = ownerPath ? getTanaSemanticBlock(editor, ownerPath) : undefined;

      return typeof owner?.id !== 'string' || !dragIds.includes(owner.id);
    })
  ) {
    return false;
  }

  if (!dragged.some(([node]) => isFieldOccurrence(node as TElement))) {
    return true;
  }

  // Field occurrence nodes can only be placed among ordinary children of an
  // ordinary host Node. Field definitions, Field rows, and value rows never
  // become ad-hoc hosts through DnD.
  const dropParentPath = getTanaParentPath(editor.children, dropEntry[1]);
  const dropParent = dropParentPath
    ? getTanaSemanticBlock(editor, dropParentPath)
    : undefined;

  return isFieldHost(dropNode) || isFieldHost(dropParent);
};

function Draggable({
  hasChildren,
  isFocusedNode,
  openIds,
  tanaPath,
  ...props
}: PlateElementProps & {
  hasChildren: boolean;
  isFocusedNode: boolean;
  openIds: ReadonlySet<string>;
  tanaPath: Path;
}) {
  const { children, editor, element } = props;
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } =
    useDraggable({
      canDropNode: canDropOnInteractableTanaNode,
      element,
      onDropHandler: (_, { dragItem }) => {
        const id = (dragItem as { id: string[] | string }).id;

        if (blockSelectionApi) {
          blockSelectionApi.add(id);
        }
        resetPreview();
      },
    });

  const [previewTop, setPreviewTop] = React.useState(0);

  const resetPreview = () => {
    if (previewRef.current) {
      previewRef.current.replaceChildren();
      previewRef.current?.classList.add('hidden');
    }
  };

  // clear up virtual multiple preview when drag end
  React.useEffect(() => {
    if (!isDragging) {
      resetPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  React.useEffect(() => {
    if (isAboutToDrag) {
      previewRef.current?.classList.remove('opacity-0');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAboutToDrag]);

  const [dragButtonTop, setDragButtonTop] = React.useState(0);

  return (
    <div
      className={cn(
        'relative',
        isDragging && 'opacity-50',
        isFocusedNode && 'tana-focusedNode',
        getPluginByType(editor, element.type)?.node.isContainer
          ? 'group/container'
          : 'group'
      )}
      onMouseEnter={() => {
        if (isDragging) return;
        setDragButtonTop(calcDragButtonTop(editor, element));
      }}
    >
      <Gutter>
          <div
            className={cn(
              'slate-blockToolbarWrapper',
              'flex h-[1.5em]',
            )}
          >
            <div
              className={cn(
                'slate-blockToolbar relative w-4.5',
                'pointer-events-auto mr-1 flex items-center',
              )}
            >
              <TanaCollapseButton
                hasChildren={hasChildren}
                nodeId={element.id}
                open={typeof element.id === 'string' && openIds.has(element.id)}
                style={{ top: `${dragButtonTop + 3}px` }}
                tanaPath={tanaPath}
              />
              <TanaZoomButton
                editor={editor}
                nodeId={element.id}
                style={{ top: `${dragButtonTop + 3}px` }}
              />
              <Button
                ref={handleRef}
                variant="ghost"
                className="left-4 absolute h-6 w-4 p-0"
                style={{ top: `${dragButtonTop + 3}px` }}
                data-plate-prevent-deselect
              >
                <DragHandle
                  isDragging={isDragging}
                  previewRef={previewRef}
                  resetPreview={resetPreview}
                  setPreviewTop={setPreviewTop}
                />
              </Button>
            </div>
          </div>
      </Gutter>

      <div
        ref={previewRef}
        className={cn('-left-0 absolute hidden w-full')}
        style={{ top: `${-previewTop}px` }}
        contentEditable={false}
      />

      <div
        ref={nodeRef}
        className={cn(
          'slate-blockWrapper relative flow-root',
          typeof (element as TElement & { tanaFieldId?: unknown }).tanaFieldId ===
            'string' && 'tana-fieldOccurrence',
          typeof (
            element as TElement & { tanaFieldValueType?: unknown }
          ).tanaFieldValueType === 'string' && 'tana-fieldValue'
        )}
        onContextMenu={(event) =>
          editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.addOnContextMenu({ element, event })
        }
      >
        <TanaFieldNodeLabel fieldId={(element as TElement & { tanaFieldId?: unknown }).tanaFieldId} />
        <TanaFieldValuePlaceholder nodeId={element.id} />
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine />
      </div>
    </div>
  );
}

/** Field occurrence labels are derived from the Field Definition Node. */
function TanaFieldNodeLabel({ fieldId }: { fieldId: unknown }) {
  const index = useTanaIndex();

  if (typeof fieldId !== 'string') return null;

  const field = index.nodesById.get(fieldId);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 max-w-[45%] truncate pt-0.5 text-[#527664] text-sm"
      contentEditable={false}
    >
      {field?.text || '未命名字段'}
    </span>
  );
}

/** Empty value Nodes remain editable Plate Nodes while showing their state. */
function TanaFieldValuePlaceholder({ nodeId }: { nodeId: unknown }) {
  const index = useTanaIndex();

  if (typeof nodeId !== 'string') return null;

  const fieldNode = Array.from(index.fieldNodesById.values()).find(
    (candidate) => candidate.valueNodeId === nodeId
  );

  if (!fieldNode || fieldNode.value) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10 pt-0.5 text-[#9aa19d] text-sm"
      contentEditable={false}
    >
      未设置
    </span>
  );
}

function TanaZoomButton({
  editor,
  nodeId,
  style,
}: {
  editor: PlateEditor;
  nodeId: unknown;
  style: React.CSSProperties;
}) {
  if (typeof nodeId !== 'string') return null;

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="聚焦节点"
      className="-left-5 absolute size-6 cursor-pointer select-none p-px text-[#8b938d] hover:bg-accent hover:text-[#1f6f52] [&_svg]:size-3"
      contentEditable={false}
      data-plate-prevent-deselect
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId);
      }}
      onMouseDown={(event) => event.preventDefault()}
      style={style}
    >
      <CircleIcon />
    </Button>
  );
}

function TanaCollapseButton({
  hasChildren,
  nodeId,
  open,
  style,
  tanaPath,
}: {
  hasChildren: boolean;
  nodeId: unknown;
  open: boolean;
  style: React.CSSProperties;
  tanaPath: Path;
}) {
  const editor = useEditorRef();

  if (!hasChildren || typeof nodeId !== 'string') return null;

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={open ? '折叠节点' : '展开节点'}
      className="-left-0 absolute size-6 cursor-pointer select-none p-px text-muted-foreground hover:bg-accent [&_svg]:size-3.5"
      contentEditable={false}
      style={style}
      data-plate-prevent-deselect
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTanaNodeCollapse(editor, nodeId, tanaPath);
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <ChevronRight
        className={cn(
          'transition-transform duration-75',
          open && 'rotate-90'
        )}
      />
    </Button>
  );
}

/**
 * Uses Plate's existing openIds and selection APIs; it stores no Local Tana
 * state. Collapsing first removes hidden blocks from Plate block selection and
 * moves a text selection out of the descendant subtree.
 */
export function toggleTanaNodeCollapse(
  editor: PlateEditor,
  nodeId: string,
  tanaPath: Path
) {
  const openIds = editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS;
  const focusedNodeId =
    editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null;

  if (openIds.has(nodeId)) {
    const collapsedOpenIds = new Set(openIds);
    collapsedOpenIds.delete(nodeId);
    const selection = editor.selection;
    const selectionWillBeHidden = selection
      ? [selection.anchor.path, selection.focus.path].some(
          (path) =>
            path.length > 0 &&
            isTanaNodeHidden(
              editor.children,
              [path[0]],
              collapsedOpenIds
            )
        )
      : false;

    const visibleSelectedIds = editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.getNodes({ sort: true })
      .flatMap(([node, path]) =>
        isTanaNodeInteractable(
          editor.children,
          path,
          collapsedOpenIds,
          focusedNodeId
        ) &&
        typeof node.id === 'string'
          ? [node.id]
          : []
      );

    editor
      .getApi(BlockSelectionPlugin)
      .blockSelection.set(visibleSelectedIds);

    if (selectionWillBeHidden) {
      editor.tf.select(tanaPath, { edge: 'start' });
      editor.tf.focus();
    }
  }

  editor.getApi(TogglePlugin).toggle.toggleIds([nodeId]);
}

function Gutter({
  children,
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const editor = useEditorRef();
  const element = useElement();
  const isSelectionAreaVisible = usePluginOption(
    BlockSelectionPlugin,
    'isSelectionAreaVisible'
  );
  const selected = useSelected();

  return (
    <div
      {...props}
      className={cn(
        'slate-gutterLeft',
        '-translate-x-full absolute top-0 z-50 flex h-full cursor-text hover:opacity-100 sm:opacity-0',
        getPluginByType(editor, element.type)?.node.isContainer
          ? 'group-hover/container:opacity-100'
          : 'group-hover:opacity-100',
        isSelectionAreaVisible && 'hidden',
        !selected && 'opacity-0',
        className
      )}
      contentEditable={false}
    >
      {children}
    </div>
  );
}

const DragHandle = React.memo(function DragHandle({
  isDragging,
  previewRef,
  resetPreview,
  setPreviewTop,
}: {
  isDragging: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  resetPreview: () => void;
  setPreviewTop: (top: number) => void;
}) {
  const editor = useEditorRef();
  const element = useElement();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex size-full items-center justify-center"
          onClick={(e) => {
            e.preventDefault();
            editor.getApi(BlockSelectionPlugin).blockSelection.focus();
          }}
          onMouseDown={(e) => {
            resetPreview();

            if ((e.button !== 0 && e.button !== 2) || e.shiftKey) return;

            const openIds =
              editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS;
            const focusedNodeId =
              editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
            const onlyInteractable = ([, path]: [TElement, Path]) =>
              isTanaNodeInteractable(
                editor.children,
                path,
                openIds,
                focusedNodeId
              );

            const blockSelection = editor
              .getApi(BlockSelectionPlugin)
              .blockSelection.getNodes({ sort: true });

            let selectionNodes =
              blockSelection.length > 0
                ? blockSelection.filter(onlyInteractable)
                : editor.api.blocks({ mode: 'highest' }).filter(onlyInteractable);

            // If current block is not in selection, use it as the starting point
            if (!selectionNodes.some(([node]) => node.id === element.id)) {
              selectionNodes = [[element, editor.api.findPath(element)!]];
            }

            // Process selection nodes to include list children
            const blocks = expandListItemsWithChildren(
              editor,
              selectionNodes
            ).map(([node]) => node);

            if (blockSelection.length === 0) {
              editor.tf.blur();
              editor.tf.collapse();
            }

            const elements = createDragPreviewElements(editor, blocks);
            previewRef.current?.append(...elements);
            previewRef.current?.classList.remove('hidden');
            previewRef.current?.classList.add('opacity-0');
            editor.setOption(DndPlugin, 'multiplePreviewRef', previewRef);

            editor
              .getApi(BlockSelectionPlugin)
              .blockSelection.set(blocks.map((block) => block.id as string));
          }}
          onMouseEnter={() => {
            if (isDragging) return;

            const openIds =
              editor.getOptions(TogglePlugin).openIds ?? EMPTY_OPEN_IDS;
            const focusedNodeId =
              editor.getOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
            const onlyInteractable = ([, path]: [TElement, Path]) =>
              isTanaNodeInteractable(
                editor.children,
                path,
                openIds,
                focusedNodeId
              );

            const blockSelection = editor
              .getApi(BlockSelectionPlugin)
              .blockSelection.getNodes({ sort: true });

            let selectedBlocks =
              blockSelection.length > 0
                ? blockSelection.filter(onlyInteractable)
                : editor.api.blocks({ mode: 'highest' }).filter(onlyInteractable);

            // If current block is not in selection, use it as the starting point
            if (!selectedBlocks.some(([node]) => node.id === element.id)) {
              selectedBlocks = [[element, editor.api.findPath(element)!]];
            }

            // Process selection to include list children
            const processedBlocks = expandListItemsWithChildren(
              editor,
              selectedBlocks
            );

            const ids = processedBlocks.map((block) => block[0].id as string);

            if (ids.length > 1 && ids.includes(element.id as string)) {
              const previewTop = calculatePreviewTop(editor, {
                blocks: processedBlocks.map((block) => block[0]),
                element,
              });
              setPreviewTop(previewTop);
            } else {
              setPreviewTop(0);
            }
          }}
          onMouseUp={() => {
            resetPreview();
          }}
          data-plate-prevent-deselect
          role="button"
        >
          <GripVertical className="text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent>拖动以移动</TooltipContent>
    </Tooltip>
  );
});

const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        'slate-dropLine',
        'absolute inset-x-0 h-0.5 opacity-100 transition-opacity',
        'bg-brand/50',
        dropLine === 'top' && '-top-px',
        dropLine === 'bottom' && '-bottom-px',
        className
      )}
    />
  );
});

const createDragPreviewElements = (
  editor: PlateEditor,
  blocks: TElement[]
): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  const ids: string[] = [];

  /**
   * Remove data attributes from the element to avoid recognized as slate
   * elements incorrectly.
   */
  const removeDataAttributes = (element: HTMLElement) => {
    Array.from(element.attributes).forEach((attr) => {
      if (
        attr.name.startsWith('data-slate') ||
        attr.name.startsWith('data-block-id')
      ) {
        element.removeAttribute(attr.name);
      }
    });

    Array.from(element.children).forEach((child) => {
      removeDataAttributes(child as HTMLElement);
    });
  };

  const resolveElement = (node: TElement, index: number) => {
    const domNode = editor.api.toDOMNode(node)!;
    const newDomNode = domNode.cloneNode(true) as HTMLElement;

    // Apply visual compensation for horizontal scroll
    const applyScrollCompensation = (
      original: Element,
      cloned: HTMLElement
    ) => {
      const scrollLeft = original.scrollLeft;

      if (scrollLeft > 0) {
        // Create a wrapper to handle the scroll offset
        const scrollWrapper = document.createElement('div');
        scrollWrapper.style.overflow = 'hidden';
        scrollWrapper.style.width = `${original.clientWidth}px`;

        // Create inner container with the full content
        const innerContainer = document.createElement('div');
        innerContainer.style.transform = `translateX(-${scrollLeft}px)`;
        innerContainer.style.width = `${original.scrollWidth}px`;

        // Move all children to the inner container
        while (cloned.firstChild) {
          innerContainer.append(cloned.firstChild);
        }

        // Apply the original element's styles to maintain appearance
        const originalStyles = window.getComputedStyle(original);
        cloned.style.padding = '0';
        innerContainer.style.padding = originalStyles.padding;

        scrollWrapper.append(innerContainer);
        cloned.append(scrollWrapper);
      }
    };

    applyScrollCompensation(domNode, newDomNode);

    ids.push(node.id as string);
    const wrapper = document.createElement('div');
    wrapper.append(newDomNode);
    wrapper.style.display = 'flow-root';

    const lastDomNode = blocks[index - 1];

    if (lastDomNode) {
      const lastDomNodeRect = editor.api
        .toDOMNode(lastDomNode)!
        .parentElement!.getBoundingClientRect();

      const domNodeRect = domNode.parentElement!.getBoundingClientRect();

      const distance = domNodeRect.top - lastDomNodeRect.bottom;

      // Check if the two elements are adjacent (touching each other)
      if (distance > 15) {
        wrapper.style.marginTop = `${distance}px`;
      }
    }

    removeDataAttributes(newDomNode);
    elements.push(wrapper);
  };

  blocks.forEach((node, index) => {
    resolveElement(node, index);
  });

  editor.setOption(DndPlugin, 'draggingId', ids);

  return elements;
};

const calculatePreviewTop = (
  editor: PlateEditor,
  {
    blocks,
    element,
  }: {
    blocks: TElement[];
    element: TElement;
  }
): number => {
  const child = editor.api.toDOMNode(element)!;
  const editable = editor.api.toDOMNode(editor)!;
  const firstSelectedChild = blocks[0];

  const firstDomNode = editor.api.toDOMNode(firstSelectedChild)!;
  // Get editor's top padding
  const editorPaddingTop = Number(
    window.getComputedStyle(editable).paddingTop.replace('px', '')
  );

  // Calculate distance from first selected node to editor top
  const firstNodeToEditorDistance =
    firstDomNode.getBoundingClientRect().top -
    editable.getBoundingClientRect().top -
    editorPaddingTop;

  // Get margin top of first selected node
  const firstMarginTopString = window.getComputedStyle(firstDomNode).marginTop;
  const marginTop = Number(firstMarginTopString.replace('px', ''));

  // Calculate distance from current node to editor top
  const currentToEditorDistance =
    child.getBoundingClientRect().top -
    editable.getBoundingClientRect().top -
    editorPaddingTop;

  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  const currentMarginTop = Number(currentMarginTopString.replace('px', ''));

  const previewElementsTopDistance =
    currentToEditorDistance -
    firstNodeToEditorDistance +
    marginTop -
    currentMarginTop;

  return previewElementsTopDistance;
};

const calcDragButtonTop = (editor: PlateEditor, element: TElement): number => {
  const child = editor.api.toDOMNode(element)!;

  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  const currentMarginTop = Number(currentMarginTopString.replace('px', ''));

  return currentMarginTop;
};
