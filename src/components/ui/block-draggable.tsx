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
import { GripVertical } from 'lucide-react';
import {
  ElementApi,
  type NodeEntry,
  type Path,
  type TElement,
  getPluginByType,
} from 'platejs';
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

import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { TanaNodeGutter } from '@/components/tana/tana-node-gutter';
import { getNodeRenderer } from '@/components/tana/node-renderer-registry';
import { useTanaIndex } from '@/components/tana/tana-index-context';
import {
  getTanaDisplayIndent,
  getTanaDisplayIndentPx,
  TANA_FIELD_LABEL_PX,
  TANA_FIELD_VALUE_GAP_PX,
  TANA_GUTTER_PX,
  TANA_INDENT_PX,
} from '@/components/tana/tana-presentation';
import { useTanaZoomPresentation } from '@/components/tana/tana-zoom-presentation';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  canDrag as canDragByNodeBehavior,
  canDrop as canDropByNodeBehavior,
  hasTanaNodeDescendants,
  getTanaDirectChildPaths,
  getTanaNodeDescendantPaths,
  getTanaNodePath,
  getTanaParentPath,
  isTanaFieldHostNode,
  isTanaNodeElement,
  isTanaNodeHidden,
  isTanaNodeInteractable,
  resolveTanaNodeTitle,
  getNodeSemanticType,
  hasNodeSemantic,
} from '@/lib/tana';

const EMPTY_OPEN_IDS = new Set<string>();

function getNodeIndent(node: TElement): number {
  return typeof node.indent === 'number' ? node.indent : 0;
}

/**
 * Plate already expands list children for a multi-block drag. A Field uses the
 * same flat indent hierarchy, so its Value Node must join that exact drag set.
 */
function expandFieldSubtreesForDrag(
  editor: PlateEditor,
  entries: NodeEntry<TElement>[]
): NodeEntry<TElement>[] {
  const entriesById = new Map<string, NodeEntry<TElement>>();
  const add = (entry: NodeEntry<TElement>) => {
    const id = entry[0].id;

    if (typeof id === 'string') entriesById.set(id, entry);
  };

  expandListItemsWithChildren(editor, entries).forEach(add);

  for (const [node, path] of Array.from(entriesById.values())) {
    if (!hasNodeSemantic(node, 'field', { document: editor.children, path })) {
      continue;
    }

    getTanaNodeDescendantPaths(editor.children, path).forEach((descendantPath) => {
      const descendant = editor.api.node(descendantPath);

      if (descendant && ElementApi.isElement(descendant[0])) {
        add(descendant as NodeEntry<TElement>);
      }
    });
  }

  return Array.from(entriesById.values()).sort(([, left], [, right]) =>
    left[0] - right[0]
  );
}

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    if (editor.dom.readOnly) return false;

    return isTanaNodeElement(element, path);
  }, [editor, element, path]);

  if (!enabled) return;

  return (nodeProps) => <TanaDraggableNode {...nodeProps} />;
};

function TanaDraggableNode(props: PlateElementProps) {
  const openIds = usePluginOption(TogglePlugin, 'openIds') ?? EMPTY_OPEN_IDS;
  const focusedNodeId =
    usePluginOption(TanaZoomPlugin, 'focusedNodeId') ?? null;
  const nodeId =
    typeof props.element.id === 'string' ? props.element.id : undefined;
  const nodeState = useEditorSelector(
    (editor) => {
      const tanaPath = nodeId
        ? getTanaNodePath(editor.children, nodeId)
        : undefined;

      if (!tanaPath) return;

      return {
        hasChildren: hasTanaNodeDescendants(editor.children, tanaPath),
        isInteractable: isTanaNodeInteractable(
          editor.children,
          tanaPath,
          openIds,
          focusedNodeId
        ),
        tanaPath,
      };
    },
    [focusedNodeId, nodeId, openIds]
  );

  if (!nodeState?.isInteractable) {
    return <HiddenTanaNode>{props.children}</HiddenTanaNode>;
  }

  return (
    <Draggable
      {...props}
      focusedNodeId={focusedNodeId}
      hasChildren={nodeState.hasChildren}
      isFocusedNode={
        typeof props.element.id === 'string' && props.element.id === focusedNodeId
      }
      openIds={openIds}
      tanaPath={nodeState.tanaPath}
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

/** The last empty direct content child is the Zoom page's Body affordance. */
function isEmptyTrailingZoomBodyNode(
  editor: PlateEditor,
  element: TElement,
  path: Path,
  focusedNodeId: string | null
): boolean {
  if (
    !focusedNodeId ||
    getNodeSemanticType(element, { document: editor.children, path }) !== 'content' ||
    element.children.length !== 1 ||
    !('text' in element.children[0]) ||
    element.children[0].text !== '' ||
    getTanaNodeDescendantPaths(editor.children, path).length > 0
  ) {
    return false;
  }

  const parentPath = getTanaParentPath(editor.children, path);
  const parent = parentPath ? editor.api.node(parentPath)?.[0] : undefined;

  return (
    !!parentPath &&
    ElementApi.isElement(parent) &&
    parent.id === focusedNodeId &&
    getTanaDirectChildPaths(editor.children, parentPath).at(-1)?.[0] === path[0]
  );
}

/**
 * This is the one visual override of Plate's raw indent injection. It leaves
 * the persisted indent untouched while rendering relative to the Zoom root.
 * Structured Values additionally retain their canonical text only for the
 * Field plugin, while their control remains the accessible editing surface.
 */
function PresentationChildren({
  children,
  displayIndent,
  structuredValue = false,
}: Pick<PlateElementProps, 'children'> & {
  displayIndent: number;
  structuredValue?: boolean;
}) {
  if (!React.isValidElement<{ attributes?: Record<string, unknown> }>(children)) {
    return <MemoizedChildren>{children}</MemoizedChildren>;
  }

  return (
    <MemoizedChildren>
      {React.cloneElement(children, {
        attributes: {
          ...children.props.attributes,
          style: {
            ...(children.props.attributes?.style as React.CSSProperties | undefined),
            marginLeft: `${displayIndent * TANA_INDENT_PX}px`,
          },
          ...(structuredValue
            ? {
                'aria-hidden': true,
                contentEditable: false,
              }
            : {}),
        },
      })}
    </MemoizedChildren>
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

  if (
    dragEntry &&
    !canDropByNodeBehavior(
      dragEntry[0] as TElement,
      dropEntry[0] as TElement,
      { document: editor.children, path: dragEntry[1] },
      { document: editor.children, path: dropEntry[1] }
    )
  ) {
    return false;
  }

  if (!('id' in dragItem)) return true;

  const dragIds = Array.isArray(dragItem.id) ? dragItem.id : [dragItem.id];
  const dragged = dragIds.flatMap((id) => {
    const dragNode = editor.api.node({ at: [], id });

    return dragNode ? [dragNode] : [];
  });

  if (dragged.length !== dragIds.length || !dragged.every(([, path]) => isInteractable(path))) {
    return false;
  }

  const dropParentPath = getTanaParentPath(editor.children, dropEntry[1]);

  // A typed value cannot be moved independently from the one Field occurrence
  // that owns it. The normal Plate multi-block drag retains the Field subtree.
  const fieldNodeIds = new Set(
    dragged.flatMap(([node, path]) =>
      hasNodeSemantic(node as TElement, 'field', {
        document: editor.children,
        path,
      }) && typeof node.id === 'string'
        ? [node.id]
        : []
    )
  );

  if (
    dragged.some(([node, path]) => {
      if (
        !hasNodeSemantic(node as TElement, 'value', {
          document: editor.children,
          path,
        })
      ) {
        return false;
      }

      const ownerPath = getTanaParentPath(editor.children, path);
      const owner = ownerPath ? editor.api.node(ownerPath)?.[0] : undefined;

      return (
        !owner ||
        !ElementApi.isElement(owner) ||
        typeof owner.id !== 'string' ||
        !fieldNodeIds.has(owner.id)
      );
    })
  ) {
    return false;
  }

  if (fieldNodeIds.size === 0) {
    return true;
  }

  // A Field row moves only with every Node in its subtree. Plate's callback
  // runs before it calculates top/bottom placement, so a direct leaf sibling
  // at the target host is the safe way to prove the resulting parent remains
  // that ordinary host for either placement direction.
  if (
    !dropParentPath ||
    !isTanaFieldHostNode(editor.children, dropParentPath) ||
    !isTanaFieldHostNode(editor.children, dropEntry[1]) ||
    hasTanaNodeDescendants(editor.children, dropEntry[1]) ||
    !getTanaDirectChildPaths(editor.children, dropParentPath).some(
      (path) => path[0] === dropEntry[1][0]
    )
  ) {
    return false;
  }

  return dragged.every(([node, path]) => {
    if (
      hasNodeSemantic(node as TElement, 'value', {
        document: editor.children,
        path,
      })
    ) {
      return true;
    }

    if (
      !hasNodeSemantic(node as TElement, 'field', {
        document: editor.children,
        path,
      })
    ) {
      return false;
    }

    const sourceParentPath = getTanaParentPath(editor.children, path);
    const subtreeIds = getTanaNodeDescendantPaths(editor.children, path).flatMap(
      (descendantPath) => {
        const descendant = editor.api.node(descendantPath)?.[0];

        return ElementApi.isElement(descendant) && typeof descendant.id === 'string'
          ? [descendant.id]
          : [];
      }
    );

    return (
      !!sourceParentPath &&
      isTanaFieldHostNode(editor.children, sourceParentPath) &&
      getNodeIndent(node as TElement) === getNodeIndent(dropEntry[0] as TElement) &&
      subtreeIds.every((id) => dragIds.includes(id))
    );
  });
};

function Draggable({
  focusedNodeId,
  hasChildren,
  isFocusedNode,
  openIds,
  tanaPath,
  ...props
}: PlateElementProps & {
  focusedNodeId: string | null;
  hasChildren: boolean;
  isFocusedNode: boolean;
  openIds: ReadonlySet<string>;
  tanaPath: Path;
}) {
  const { children, editor, element } = props;
  const semanticType = getNodeSemanticType(element, {
    document: editor.children,
    path: tanaPath,
  });
  const BlockRenderer = getNodeRenderer(semanticType).Block;
  const index = useTanaIndex();
  const { baseIndent } = useTanaZoomPresentation();
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;
  const isDraggable = canDragByNodeBehavior(element, {
    document: editor.children,
    path: tanaPath,
  });
  const indent = getNodeIndent(element);
  const displayIndent = getTanaDisplayIndent(indent, baseIndent);
  const displayIndentPx = getTanaDisplayIndentPx(indent, baseIndent);
  const isTrailingZoomBodyNode = isEmptyTrailingZoomBodyNode(
    editor,
    element,
    tanaPath,
    focusedNodeId
  );
  const fieldValueOffset = `${
    Math.max(0, displayIndent - 1) * TANA_INDENT_PX +
    TANA_FIELD_LABEL_PX +
    TANA_FIELD_VALUE_GAP_PX
  }px`;
  const nodeId = typeof element.id === 'string' ? element.id : undefined;
  const derivedTitle = nodeId ? resolveTanaNodeTitle(index, nodeId) : undefined;
  const showsDerivedTitle =
    semanticType === 'content' &&
    !!nodeId &&
    derivedTitle !== undefined &&
    derivedTitle !== index.nodesById.get(nodeId)?.text;
  const semanticField = nodeId
    ? semanticType === 'field'
      ? index.fieldNodesById.get(nodeId)
      : semanticType === 'value'
        ? Array.from(index.fieldNodesById.values()).find((field) =>
            field.valueNodeIds.includes(nodeId)
          )
        : undefined
    : undefined;
  const gutterLabel =
    derivedTitle ||
    (semanticField
      ? index.nodesById.get(semanticField.fieldId)?.text
      : index.nodesById.get(nodeId ?? '')?.text) ||
    '';
  const gutterFieldId =
    semanticField?.fieldId ??
    (semanticType === 'field-definition' ? nodeId : undefined);
  const gutterFieldType = gutterFieldId
    ? index.nodesById.get(gutterFieldId)?.fieldDefinition?.type
    : undefined;

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } =
    useDraggable({
      canDropNode: canDropOnInteractableTanaNode,
      // Keep Plate's default drag lifecycle for valid Nodes. Only Value Nodes
      // override it, so their source is blocked even without a rendered handle.
      drag: isDraggable ? undefined : { canDrag: () => false },
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
        'tana-node group/tanaNode relative',
        `tana-node--${semanticType}`,
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
        {nodeId && (
          <TanaNodeGutter
            dragHandle={
              <DragHandle
                isDragging={isDragging}
                previewRef={previewRef}
                resetPreview={resetPreview}
                setPreviewTop={setPreviewTop}
              />
            }
            dragHandleRef={handleRef}
            fieldType={gutterFieldType}
            hasChildren={hasChildren}
            isDraggable={isDraggable}
            isFocusedNode={isFocusedNode}
            nodeLabel={gutterLabel}
            open={openIds.has(nodeId)}
            semanticType={semanticType}
            style={{
              left: `${displayIndentPx - TANA_GUTTER_PX}px`,
              // Keep the fixed 20px gutter controls centered on the first
              // text line. The focused page title has a larger line-height.
              top: `${dragButtonTop + (isFocusedNode ? 10 : 4)}px`,
            }}
            onCollapse={() => toggleTanaNodeCollapse(editor, nodeId, tanaPath)}
            onZoom={() => editor.getTransforms(TanaZoomPlugin).zoom.to(nodeId)}
          />
        )}
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
          semanticType === 'field' && 'tana-fieldOccurrence',
          semanticType === 'value' && 'tana-fieldValue',
          isTrailingZoomBodyNode && 'tana-emptyZoomBodyNode'
        )}
        data-tana-semantic={semanticType}
        style={
          {
            '--tana-display-indent': `${displayIndentPx}px`,
            ...(semanticType === 'value'
              ? { '--tana-field-value-offset': fieldValueOffset }
              : {}),
          } as React.CSSProperties
        }
        onContextMenu={(event) =>
          editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.addOnContextMenu({ element, event })
        }
      >
        {BlockRenderer && <BlockRenderer element={element} index={index} />}
        {showsDerivedTitle && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 flex h-8 items-center bg-[var(--tana-canvas)] pr-1 font-medium text-[13px] text-[var(--tana-text-secondary)]"
            contentEditable={false}
            style={{ left: `${displayIndentPx}px`, right: '1rem' }}
          >
            <span className="truncate">{derivedTitle}</span>
          </span>
        )}
        {semanticType === 'value' &&
        element.tanaFieldValueType !== 'plain' &&
        element.tanaFieldValueType !== 'number' ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden text-transparent"
            contentEditable={false}
          >
            <PresentationChildren displayIndent={displayIndent} structuredValue>
              {children}
            </PresentationChildren>
          </div>
        ) : (
          <PresentationChildren displayIndent={displayIndent}>
            {children}
          </PresentationChildren>
        )}
        <DropLine />
      </div>
    </div>
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
  const isSelectionAreaVisible = usePluginOption(
    BlockSelectionPlugin,
    'isSelectionAreaVisible'
  );
  return (
    <div
      {...props}
      className={cn(
        'slate-gutterLeft',
        'absolute top-0 left-0 z-50 flex h-full cursor-text',
        isSelectionAreaVisible && 'hidden',
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

            const blocks = expandFieldSubtreesForDrag(editor, selectionNodes).map(
              ([node]) => node
            );

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

            const processedBlocks = expandFieldSubtreesForDrag(
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
