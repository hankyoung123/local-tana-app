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
        { fieldId: 'field-summary' },
        { fieldId: 'field-estimate' },
        { fieldId: 'field-active' },
        { fieldId: 'field-due' },
        { fieldId: 'field-status' },
        { fieldId: 'field-owner' },
      ],
    },
    type: 'p',
  },
  {
    id: 'field-summary',
    children: [{ text: '摘要' }],
    indent: 3,
    tanaFieldDefinition: { type: 'plain' },
    type: 'p',
  },
  {
    id: 'field-estimate',
    children: [{ text: '预估' }],
    indent: 3,
    tanaFieldDefinition: { type: 'number' },
    type: 'p',
  },
  {
    id: 'field-active',
    children: [{ text: '进行中' }],
    indent: 3,
    tanaFieldDefinition: { type: 'checkbox' },
    type: 'p',
  },
  {
    id: 'field-due',
    children: [{ text: '截止日期' }],
    indent: 3,
    tanaFieldDefinition: { type: 'date' },
    type: 'p',
  },
  {
    id: 'field-status',
    children: [{ text: '状态' }],
    indent: 3,
    tanaFieldDefinition: {
      options: ['option-planned', 'option-active', 'option-completed'],
      type: 'options',
    },
    type: 'p',
  },
  {
    id: 'option-planned',
    children: [{ text: '计划中' }],
    indent: 4,
    type: 'p',
  },
  {
    id: 'option-active',
    children: [{ text: '进行中' }],
    indent: 4,
    type: 'p',
  },
  {
    id: 'option-completed',
    children: [{ text: '已完成' }],
    indent: 4,
    type: 'p',
  },
  {
    id: 'field-owner',
    children: [{ text: '负责人' }],
    indent: 3,
    tanaFieldDefinition: {
      sourceSupertagId: 'supertag-project',
      type: 'from-supertag',
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
