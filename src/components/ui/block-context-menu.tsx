'use client';

import * as React from 'react';

import {
  BLOCK_CONTEXT_MENU_ID,
  BlockMenuPlugin,
  BlockSelectionPlugin,
} from '@platejs/selection/react';
import { KEYS } from 'platejs';
import {
  useEditorPlugin,
  useEditorReadOnly,
  usePluginOption,
} from 'platejs/react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { setBlockType } from '@/components/editor/transforms';
import { TanaZoomPlugin } from '@/components/editor/plugins/tana-zoom-plugin';
import { useIsTouchDevice } from '@/hooks/use-is-touch-device';
import {
  canDuplicate,
  canIndent,
  canOutdent,
  canSelect,
  canTrash,
  canTurnInto,
  canUseSlashCommand,
} from '@/lib/tana/node-behavior';

export function BlockContextMenu({ children }: { children: React.ReactNode }) {
  const { api, editor } = useEditorPlugin(BlockMenuPlugin);
  const isTouch = useIsTouchDevice();
  const readOnly = useEditorReadOnly();
  const openId = usePluginOption(BlockMenuPlugin, 'openId');
  const isOpen = openId === BLOCK_CONTEXT_MENU_ID;
  const selectedNodes = editor
    .getApi(BlockSelectionPlugin)
    .blockSelection.getNodes({ sort: true });
  const canApplyToSelection = (
    policy:
      | typeof canDuplicate
      | typeof canIndent
      | typeof canOutdent
      | typeof canTrash
      | typeof canTurnInto
  ) =>
    selectedNodes.length > 0 &&
    selectedNodes.every(([node, path]) =>
      policy(node, { document: editor.children, path })
    );
  const canDelete = canApplyToSelection(canTrash);
  const canDuplicateSelection = canApplyToSelection(canDuplicate);
  const canTurnSelectionInto = canApplyToSelection(canTurnInto);
  const canIncreaseIndent = canApplyToSelection(canIndent);
  const canDecreaseIndent = canApplyToSelection(canOutdent);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const selectedNodeId = selectedNode?.[0].id;
  const canZoomToSelection =
    !!selectedNode &&
    typeof selectedNodeId === 'string' &&
    canSelect(selectedNode[0], { document: editor.children, path: selectedNode[1] });
  const canAddChild =
    canZoomToSelection &&
    canUseSlashCommand(selectedNode![0], {
      document: editor.children,
      path: selectedNode![1],
    });

  const handleTurnInto = React.useCallback(
    (type: string) => {
      editor
        .getApi(BlockSelectionPlugin)
        .blockSelection.getNodes()
        .forEach(([, path]) => {
          setBlockType(editor, type, { at: path });
        });
    },
    [editor]
  );

  if (isTouch) {
    return children;
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) {
          api.blockMenu.hide();
        }
      }}
      modal={false}
    >
      <ContextMenuTrigger
        asChild
        onContextMenu={(event) => {
          const dataset = (event.target as HTMLElement).dataset;
          const disabled =
            dataset?.slateEditor === 'true' ||
            readOnly ||
            dataset?.plateOpenContextMenu === 'false';

          if (disabled) return event.preventDefault();

          setTimeout(() => {
            api.blockMenu.show(BLOCK_CONTEXT_MENU_ID, {
              x: event.clientX,
              y: event.clientY,
            });
          }, 0);
        }}
      >
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>
      {isOpen && (
        <ContextMenuContent
          className="w-64"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            editor.getApi(BlockSelectionPlugin).blockSelection.focus();

          }}
        >
          <ContextMenuGroup>
            {canZoomToSelection && (
              <ContextMenuItem
                onClick={() =>
                  editor.getTransforms(TanaZoomPlugin).zoom.to(selectedNodeId)
                }
              >
                打开节点
              </ContextMenuItem>
            )}
            {canAddChild && (
              <ContextMenuItem
                onClick={() => {
                  if (!editor.getTransforms(TanaZoomPlugin).zoom.to(selectedNodeId)) {
                    return;
                  }

                  editor.getTransforms(TanaZoomPlugin).zoom.insertBodyChild();
                }}
              >
                添加子节点
              </ContextMenuItem>
            )}
            {canDelete && (
              <ContextMenuItem
                onClick={() => {
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.removeNodes();
                  editor.tf.focus();
                }}
              >
                删除
              </ContextMenuItem>
            )}
            {canDuplicateSelection && (
              <ContextMenuItem
                onClick={() => {
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.duplicate();
                }}
              >
                复制
                {/* <ContextMenuShortcut>⌘ + D</ContextMenuShortcut> */}
              </ContextMenuItem>
            )}
            {canTurnSelectionInto && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>转换为</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onClick={() => handleTurnInto(KEYS.p)}>
                    段落
                  </ContextMenuItem>

                  <ContextMenuItem onClick={() => handleTurnInto(KEYS.h1)}>
                    标题 1
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleTurnInto(KEYS.h2)}>
                    标题 2
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleTurnInto(KEYS.h3)}>
                    标题 3
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => handleTurnInto(KEYS.blockquote)}
                  >
                    引用块
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
          </ContextMenuGroup>

          <ContextMenuGroup>
            {canIncreaseIndent && (
              <ContextMenuItem
                onClick={() =>
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.setIndent(1)
                }
              >
                增加缩进
              </ContextMenuItem>
            )}
            {canDecreaseIndent && (
              <ContextMenuItem
                onClick={() =>
                  editor
                    .getTransforms(BlockSelectionPlugin)
                    .blockSelection.setIndent(-1)
                }
              >
                减少缩进
              </ContextMenuItem>
            )}
          </ContextMenuGroup>
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
