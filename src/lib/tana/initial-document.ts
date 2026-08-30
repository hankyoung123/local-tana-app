import { normalizeStaticValue } from 'platejs';

export const initialDocument = normalizeStaticValue([
  {
    id: 'workspace-root',
    children: [{ text: 'Local Tana' }],
    type: 'p',
  },
  {
    id: 'node-principle',
    children: [{ text: 'Plate 提供编辑器能力，Local Tana 只补充语义。' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'node-document-source',
    children: [{ text: 'Plate 文档是唯一真相源。' }],
    indent: 2,
    type: 'p',
  },
  {
    id: 'node-first-loop',
    children: [{ text: '第一个可用闭环' }],
    type: 'toggle',
  },
  {
    id: 'node-reference',
    children: [
      { text: '行内引用复用 Plate Mention：' },
      {
        children: [{ text: '' }],
        key: 'workspace-root',
        type: 'mention',
      },
    ],
    indent: 1,
    type: 'p',
  },
  {
    id: 'node-supertag',
    children: [{ text: '超级标签复用 Plate Combobox。' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'supertag-project',
    children: [{ text: '项目' }],
    indent: 2,
    tanaSupertagDefinition: {
      fields: [
        { id: 'field-summary', name: '摘要', type: 'text' },
        { id: 'field-estimate', name: '预估', type: 'number' },
        { id: 'field-active', name: '进行中', type: 'boolean' },
        { id: 'field-due', name: '截止日期', type: 'date' },
        {
          id: 'field-status',
          name: '状态',
          options: ['计划中', '进行中', '已完成'],
          type: 'select',
        },
        { id: 'field-owner', name: '负责人', type: 'node-reference' },
      ],
    },
    type: 'p',
  },
  {
    id: 'node-project-example',
    children: [
      { text: '示例 ' },
      {
        children: [{ text: '' }],
        key: 'supertag-project',
        type: 'tana_supertag',
      },
    ],
    indent: 2,
    type: 'p',
  },
  {
    id: 'node-local-persistence',
    children: [{ text: 'SQLite 在本地持久化文档。' }],
    indent: 1,
    type: 'p',
  },
  {
    id: 'view-projects',
    children: [{ text: '全部项目' }],
    tanaViewDefinition: {
      clauses: [{ kind: 'has-supertag', supertagId: 'supertag-project' }],
    },
    type: 'p',
  },
]);
