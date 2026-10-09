export const TANA_WORKSPACE_COMMAND_IDS = [
  'new-node',
  'quick-add',
  'search',
  'open-command-palette',
  'today',
  'navigate-back',
  'navigate-forward',
  'navigate-root',
  'toggle-inspector',
  'open-field-inspector',
  'toggle-sidebar',
  'toggle-focus-mode',
  'copy-link',
  'undo',
  'redo',
  'duplicate',
  'trash',
  'toggle-done',
  'collapse-node',
  'expand-node',
] as const;

export type TanaWorkspaceCommandId = (typeof TANA_WORKSPACE_COMMAND_IDS)[number];

export type TanaWorkspaceCommandHandlers = Partial<
  Record<TanaWorkspaceCommandId, () => void>
>;

export function isTanaWorkspaceCommandId(value: unknown): value is TanaWorkspaceCommandId {
  return (
    typeof value === 'string' &&
    (TANA_WORKSPACE_COMMAND_IDS as readonly string[]).includes(value)
  );
}

export function runTanaWorkspaceCommand(
  handlers: TanaWorkspaceCommandHandlers,
  command: TanaWorkspaceCommandId,
) {
  handlers[command]?.();
}

export const TANA_COMMAND_PALETTE_GROUPS = [
  {
    label: '导航',
    items: [
      { id: 'search', label: '搜索节点', shortcut: '⌘ K' },
      { id: 'open-command-palette', label: '打开命令面板', shortcut: '⌘ P' },
      { id: 'today', label: '打开今天', shortcut: '⇧ ⌘ T' },
      { id: 'navigate-back', label: '返回上一页', shortcut: '⌘ [' },
      { id: 'navigate-forward', label: '前进到下一页', shortcut: '⌘ ]' },
      { id: 'navigate-root', label: '返回工作区根节点', shortcut: '' },
    ],
  },
  {
    label: '编辑',
    items: [
      { id: 'undo', label: '撤销', shortcut: '⌘ Z' },
      { id: 'redo', label: '重做', shortcut: '⇧ ⌘ Z' },
      { id: 'new-node', label: '新建节点', shortcut: '⌘ N' },
      { id: 'quick-add', label: 'Quick Add', shortcut: '⌘ E' },
      { id: 'duplicate', label: '复制当前节点', shortcut: '⇧ ⌘ D' },
      { id: 'trash', label: '移到回收站', shortcut: '⇧ ⌘ ⌫' },
      { id: 'toggle-done', label: '切换完成状态', shortcut: '⌘ ↵' },
    ],
  },
  {
    label: '字段',
    items: [
      { id: 'open-field-inspector', label: '打开字段检查器', shortcut: '' },
    ],
  },
  {
    label: '视图',
    items: [
      { id: 'toggle-inspector', label: '显示或隐藏检查器', shortcut: '' },
      { id: 'toggle-sidebar', label: '切换侧栏', shortcut: '' },
      { id: 'toggle-focus-mode', label: '切换专注模式', shortcut: '⇧ ⌘ F' },
      { id: 'collapse-node', label: '折叠当前节点', shortcut: '⌘ ↑' },
      { id: 'expand-node', label: '展开当前节点', shortcut: '⌘ ↓' },
      { id: 'copy-link', label: '复制当前页面链接', shortcut: '' },
    ],
  },
] satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{
    id: TanaWorkspaceCommandId;
    label: string;
    shortcut: string;
  }>;
}>;
